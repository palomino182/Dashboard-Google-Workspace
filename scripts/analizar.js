// Uso: node scripts/analizar.js <archivo.json> [fechaRef YYYY-MM-DD]
const fs=require('fs'),path=require('path');
const file=process.argv[2]; const ref=new Date(process.argv[3]||'2026-11-17T23:59:59');
const u=JSON.parse(fs.readFileSync(file,'utf8')).users;
const GENERIC=/^(admin|adm|almacen|administra|soporte|sistemas|ventas|info|contacto|operaciones|facturacion|cobranza|logistica|recepcion|rrhh|compras|tesoreria|contabilidad|despacho|seguridad|noreply|no-reply|test|prueba|bot|api|web|notificacion|alertas|reportes|monitoreo)/i;
const rows=u.map(x=>{
  const email=x['Email Address [Required]'],status=x['Status [READ ONLY]'],ls=x['Last Sign In [READ ONLY]'];
  const gb=parseFloat((x['Email Usage [READ ONLY]']||'0').replace('GB',''))||0;
  let dias=null; if(/^\d{4}\//.test(ls)){dias=Math.floor((ref-new Date(ls.replace(/\//g,'-').replace(' ','T')))/864e5);}
  const nombre=`${x['First Name [Required]']} ${x['Last Name [Required]']}`.trim();
  const generica=GENERIC.test(email.split('@')[0])||GENERIC.test(x['First Name [Required]']);
  let cat,accion;
  if(status==='Suspended'){cat='1-SUSPENDIDA';accion='Eliminar (respaldar/transferir datos antes)';}
  else if(dias===null){cat='2-NUNCA_INGRESO';accion=generica?'Revisar: buzón genérico sin uso -> convertir en Grupo o eliminar':'Eliminar';}
  else if(dias>365){cat='3-INACTIVA_>1AÑO';accion='Eliminar (respaldar/transferir datos antes)';}
  else if(dias>180){cat='4-INACTIVA_180-365D';accion='Confirmar con área y eliminar';}
  else if(dias>90){cat='5-INACTIVA_90-180D';accion='Revisar con jefatura';}
  else {cat='6-ACTIVA';accion='Mantener';}
  const nota=[]; if(gb>=30&&cat<'6') nota.push('Mucho almacenamiento: exportar/transferir antes de borrar');
  if(generica&&cat<'6') nota.push('Cuenta genérica/servicio: verificar dependencias (alias, integraciones, apps)');
  return {categoria:cat,accion,email,nombre,dominio:email.split('@')[1],estado:status,ultimo_acceso:ls,dias_sin_acceso:dias??'',uso_gb:gb,generica:generica?'SI':'',nota:nota.join(' | ')};
}).sort((a,b)=>a.categoria.localeCompare(b.categoria)||(+b.dias_sin_acceso||99999)-(+a.dias_sin_acceso||99999));
const out=path.join(path.dirname(file),'..','resultados'); fs.mkdirSync(out,{recursive:true});
const cols=Object.keys(rows[0]); const esc=v=>{v=String(v);return /[",;\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v};
fs.writeFileSync(path.join(out,'analisis_licencias.csv'),'\ufeff'+[cols.join(';'),...rows.map(r=>cols.map(c=>esc(r[c])).join(';'))].join('\n'));
fs.writeFileSync(path.join(out,'analisis_licencias.json'),JSON.stringify(rows,null,1));
// resumen
const by={};rows.forEach(r=>{by[r.categoria]=by[r.categoria]||{n:0,gb:0,gen:0,big:0};const b=by[r.categoria];b.n++;b.gb+=r.uso_gb;if(r.generica)b.gen++;if(r.uso_gb>=30)b.big++;});
console.log('Total',rows.length);for(const k in by)console.log(k,by[k].n,'cuentas',by[k].gb.toFixed(1),'GB','genericas',by[k].gen,'>=30GB',by[k].big);
const dom={};rows.filter(r=>r.categoria<'5').forEach(r=>dom[r.dominio]=(dom[r.dominio]||0)+1);console.log('Eliminables por dominio',dom);
console.log('\nNUNCA INGRESO:');rows.filter(r=>r.categoria==='2-NUNCA_INGRESO').forEach(r=>console.log(' ',r.email,'|',r.nombre,'|',r.uso_gb+'GB'));
console.log('\nACTIVAS >180d:');rows.filter(r=>r.categoria==='3-INACTIVA_>1AÑO'||r.categoria==='4-INACTIVA_180-365D').forEach(r=>console.log(' ',r.categoria.slice(0,1),r.email,'|',r.ultimo_acceso,'|',r.dias_sin_acceso+'d','|',r.uso_gb+'GB'));
console.log('\nSUSPENDIDAS con >=30GB:');rows.filter(r=>r.categoria==='1-SUSPENDIDA'&&r.uso_gb>=30).forEach(r=>console.log(' ',r.email,'|',r.uso_gb+'GB'));
console.log('\nSUSPENDIDAS acceso reciente (<90d):');rows.filter(r=>r.categoria==='1-SUSPENDIDA'&&r.dias_sin_acceso!==''&&r.dias_sin_acceso<90).forEach(r=>console.log(' ',r.email,'|',r.ultimo_acceso));
// --- Datos para el dashboard ---
// Fases de eliminación: de menor a mayor riesgo
function fase(r,o){const d=r.dias_sin_acceso,big=r.uso_gb>=30,gen=!!r.generica,sus=r.estado==='Suspended';
 const F=(n,t)=>({fase_n:n,fase:t});
 if(o>4) return F(9,'Sin fase');
 if(gen) return F(8,'Aparte: genérica o de servicio');
 if(sus&&d>365&&!big) return F(1,'Fase 1');
 if(sus&&d>365) return F(2,'Fase 2');
 if(sus&&d>=90) return F(3,'Fase 3');
 if(sus) return F(7,'Aparte: suspensión reciente');
 if(o===3) return F(4,'Fase 4');
 if(o===4) return F(5,'Fase 5');
 return F(6,'Aparte: nunca ingresó');}
const ETQ={'1-SUSPENDIDA':'Suspendida','2-NUNCA_INGRESO':'Nunca ingresó','3-INACTIVA_>1AÑO':'Sin acceso > 1 año','4-INACTIVA_180-365D':'Sin acceso 6–12 meses','5-INACTIVA_90-180D':'Sin acceso 3–6 meses','6-ACTIVA':'En uso'};
const dashRows=rows.map(r=>{const o=+r.categoria[0];return {email:r.email,nombre:r.nombre,dominio:r.dominio,
 estado:r.estado==='Suspended'?'Suspendida':'Activa',
 ultimo_acceso:/^\d{4}\//.test(r.ultimo_acceso)?r.ultimo_acceso.slice(0,10).replace(/\//g,'-'):null,
 dias_sin_acceso:r.dias_sin_acceso===''?null:r.dias_sin_acceso,uso_gb:r.uso_gb,orden:o,categoria:ETQ[r.categoria],
 decision:o<=4?'Liberar':o===5?'Revisar':'Mantener',accion:r.accion,generica:r.generica?'Sí':'',nota:r.nota,...fase(r,o)}});
fs.writeFileSync(path.join(out,'dashboard_cuentas.json'),JSON.stringify({rows:dashRows,meta:[
 {label:'analizar.js',value:fs.readFileSync(__filename,'utf8'),type:'code',lang:'javascript'},
 {label:'Input',value:path.basename(file)},{label:'Fecha de referencia',value:ref.toISOString().slice(0,10)}]}));
