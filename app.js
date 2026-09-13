// ============================================================
// Ficha de Terreno v5
// ============================================================
const CULTIVOS_DEFAULT=['Alfalfa','Pradera / Ballica','Maíz','Papa','Cebada','Trigo','Remolacha','Hortalizas','Frutales','Vides','Flores'];
const FUENTES_DEFAULT=['Canal de riego','Río / Estero','Lago / Laguna','Pozo profundo','Pozo noria','Pozo zanja','Puntera (wellpoint)','Pozo sondaje (tubería de revestimiento)','Estanque acumulador','Tranque predial','Embalse','Vertiente intrapredial','Aguas lluvia (acumulación)'];
const DERECHO_OPTS=[{v:'permanente',l:'Permanente — inscrito CBR'},{v:'eventual',l:'Eventual — inscrito CBR'},{v:'no-inscrito-lluvia',l:'No inscrito — Art. 10 (Aguas lluvia)'},{v:'no-inscrito-vertiente',l:'No inscrito — Art. 20 (Vertiente/laguna)'},{v:'no-inscrito-art56',l:'No inscrito — Art. 56 (Consumo humano)'}];
const SISTEMA_OPTS=[{v:'got',l:'Goteo'},{v:'asp',l:'Aspersión'},{v:'mic',l:'Microaspersión'},{v:'car',l:'Carrete'}];
const REGIONES=['Arica y Parinacota','Tarapacá','Antofagasta','Atacama','Coquimbo','Valparaíso','Metropolitana','O\'Higgins','Maule','Ñuble','Biobío','La Araucanía','Los Ríos','Los Lagos','Aysén','Magallanes'];
const PFX={got:'g',asp:'a',mic:'m',car:'c'};
const DR_SUP={asp:'a-strie',car:'c-supr',got:'g-sup',mic:'m-sup'};
const SISTEMA_MAP={got:'Goteo',asp:'Aspersión',mic:'Microaspersión',car:'Carrete'};
const SINO=['Si','No'];

// ---- IndexedDB ----
let DB;
function idbOpen(){return new Promise((res,rej)=>{const r=indexedDB.open('fichaTerrenoDB',3);r.onupgradeneeded=e=>{const d=e.target.result;if(!d.objectStoreNames.contains('fichas'))d.createObjectStore('fichas',{keyPath:'id'});};r.onsuccess=e=>{DB=e.target.result;res(DB);};r.onerror=e=>rej(e);});}
function idbPut(f){if(!DB)return;try{const tx=DB.transaction('fichas','readwrite');tx.objectStore('fichas').put(f);}catch(e){console.warn('idbPut:',e);}}
function idbDelete(id){return new Promise((res,rej)=>{const tx=DB.transaction('fichas','readwrite');tx.objectStore('fichas').delete(id);tx.oncomplete=()=>res();tx.onerror=e=>rej(e);});}
function idbGetAll(){return new Promise((res,rej)=>{const tx=DB.transaction('fichas','readonly');const r=tx.objectStore('fichas').getAll();r.onsuccess=()=>res(r.result||[]);r.onerror=e=>rej(e);});}

// ---- Estado ----
let F=null,curStep=0;
function uuid(){return 'f'+Date.now().toString(36)+Math.random().toString(36).slice(2,8);}

function blankFicha(){
  return{id:uuid(),fecha:new Date().toISOString().slice(0,10),creado:Date.now(),modificado:Date.now(),
    contacto:{nombre:'',rut:'',telefono:'',region:'Ñuble',comuna:'',sector:''},
    proyecto:{nombreProyecto:'',consultor:'',rolAvaluo:'',sistemaRiego:'',sistemaSecundario:'',supTotalHa:'',supRegarHa:'',coordNorte:'',coordEste:'',huso:'18'},
    fuente:{tipo:'',coordNorte:'',coordEste:'',huso:'18',caracteristicas:'',observaciones:'',caudalLs:'',horasRiegoDia:'',alturaSuccion:'',deltaZ:''},
    tenencia:{tipoTierra:'',tipoDerecho:''},
    sra:{cultivo:'',cultivoOtro:'',superficieM2:'',metodo:'',meses:'',obras:''},
    srf:{cultivo:'',cultivoOtro:'',metodo:'',meses:'',obras:''},
    energia:{tipoDisponible:'',tipoProyectada:'',notas:''},
    otros:{inicioActividades:'Si',incluyeIVA:'Si',usuarioIndap:'Si'},
    croquisFondo:'',dibujoEsquematico:'',
    fotos:[],anexos:[]};
}

function migrar(f){
  if(!f.sra)f.sra={cultivo:'',cultivoOtro:'',superficieM2:'',metodo:'',meses:'',obras:''};
  if(!f.srf)f.srf={cultivo:'',cultivoOtro:'',metodo:'',meses:'',obras:''};
  if(!f.tenencia)f.tenencia={tipoTierra:'',tipoDerecho:''};
  if(!f.otros)f.otros={inicioActividades:'Si',incluyeIVA:'Si',usuarioIndap:'Si'};
  if(!f.proyecto.sistemaSecundario)f.proyecto.sistemaSecundario=f.proyecto.sistemasNota||'';
  if(Array.isArray(f.proyecto.sistemas)&&!f.proyecto.sistemaRiego)f.proyecto.sistemaRiego=f.proyecto.sistemas[0]||'';
  if(!f.contacto.region)f.contacto.region='Ñuble';
  if(f.fuente.alturaSuccion===undefined)f.fuente.alturaSuccion='';
  if(f.fuente.deltaZ===undefined)f.fuente.deltaZ='';
  if(!f.croquisFondo)f.croquisFondo='';
  if(f.otros.usuarioIndap===undefined)f.otros.usuarioIndap=f.otros.participaINDAP||'Si';
  // borrar campos viejos que ya no se usan
  delete f.firmaEncuestador; delete f.firmaBeneficiario;
  return f;
}

// ---- Toast ----
function toast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('on');clearTimeout(toast._t);toast._t=setTimeout(()=>t.classList.remove('on'),2800);}

// ---- Auto-guardado silencioso ----
function autoGuardar(){if(F&&DB){F.modificado=Date.now();idbPut(F);}}

// ---- Home ----
async function goHome(){
  document.getElementById('home').style.display='block';
  document.getElementById('editor').style.display='none';
  document.getElementById('btnBack').style.display='none';
  document.getElementById('fabNew').style.display='block';
  document.getElementById('topTitle').textContent='Ficha de Terreno';
  renderLista();
}
async function renderLista(){
  const fichas=(await idbGetAll()).sort((a,b)=>b.modificado-a.modificado);
  const el=document.getElementById('listaFichas');
  document.getElementById('emptyMsg').style.display=fichas.length?'none':'block';
  el.innerHTML=fichas.map(f=>`<div class="list-item">
    <div onclick="abrirFicha('${f.id}')" style="flex:1;cursor:pointer">
      <div style="font-weight:700">${f.contacto.nombre||'(sin nombre)'}</div>
      <div class="meta">${f.fecha} · ${f.contacto.comuna||''} ${f.contacto.sector?'· '+f.contacto.sector:''}</div>
    </div>
    <button class="btn sm" onclick="abrirFicha('${f.id}')">Abrir</button>
    <button class="btn sm warn" onclick="borrarFicha('${f.id}')">Eliminar</button>
  </div>`).join('');
}
async function borrarFicha(id){if(!confirm('¿Eliminar esta ficha?'))return;await idbDelete(id);toast('Eliminada');renderLista();}
function nuevaFicha(){F=blankFicha();autoGuardar();curStep=0;abrirEditor();}
async function abrirFicha(id){const fichas=await idbGetAll();F=migrar(fichas.find(f=>f.id===id));curStep=0;abrirEditor();}
function abrirEditor(){
  document.getElementById('home').style.display='none';
  document.getElementById('editor').style.display='block';
  document.getElementById('btnBack').style.display='inline-block';
  document.getElementById('fabNew').style.display='none';
  document.getElementById('topTitle').textContent=F.contacto.nombre||'Nueva ficha';
  renderPills();renderStep();
}

// ---- Pasos ----
const STEPS=[
  {id:'datos_generales',t:'Datos generales'},
  {id:'fuente_tenencia',t:'Fuente / Tenencia'},
  {id:'superficie_energia',t:'Sup. / Energía'},
  {id:'croquis',t:'Croquis'},
  {id:'fotos',t:'Fotos'},
  {id:'anexos',t:'Anexos'},
  {id:'exportar',t:'Exportar'}
];
function renderPills(){
  document.getElementById('pillNav').innerHTML=STEPS.map((s,i)=>
    `<button class="pill${i===curStep?' on':''}" onclick="irPaso(${i})">${i+1}. ${s.t}</button>`).join('');
}
function irPaso(i){guardarPasoActual();curStep=i;renderPills();renderStep();}
function renderStep(){
  const s=STEPS[curStep];
  document.getElementById('stepsWrap').innerHTML=`<div class="card">${RENDERERS[s.id]()}</div>
    <div class="navbtns">
      <button class="btn" onclick="pasoAnterior()"${curStep===0?' disabled':''}>‹ Anterior</button>
      <button class="btn pri" onclick="pasoSiguiente()">${curStep===STEPS.length-1?'Finalizar':'Siguiente ›'}</button>
    </div>`;
  if(s.id==='croquis')setTimeout(initCroquis,80);
}
function pasoAnterior(){guardarPasoActual();if(curStep>0){curStep--;renderPills();renderStep();}}
function pasoSiguiente(){guardarPasoActual();if(curStep<STEPS.length-1){curStep++;renderPills();renderStep();}else{toast('Ficha guardada ✓');goHome();}}

// ---- Helpers formulario ----
function val(id){const e=document.getElementById(id);if(!e)return '';if(e.type==='checkbox')return e.checked;return e.value;}
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');}

function field(label,id,value,opts={}){
  const t=opts.type||'text',full=opts.full?' full':'';
  if(t==='select'){
    const os=(opts.options||[]).map(o=>{const v=typeof o==='string'?o:o.v,l=typeof o==='string'?o:o.l;return `<option value="${esc(v)}"${v===value?' selected':''}>${esc(l)}</option>`;}).join('');
    return `<div class="f${full}"><label>${label}</label><select id="${id}"><option value="">—</option>${os}</select></div>`;
  }
  if(t==='textarea')return `<div class="f${full}"><label>${label}</label><textarea id="${id}" placeholder="${esc(opts.placeholder||'')}">${esc(value||'')}</textarea></div>`;
  return `<div class="f${full}"><label>${label}</label><input type="${t}" id="${id}" value="${esc(value||'')}" placeholder="${esc(opts.placeholder||'')}"${opts.step?` step="${opts.step}"`:''} ></div>`;
}

function coordRow(pfx,norte,este,huso){
  return `<div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:nowrap;margin-bottom:10px">
    <div class="f" style="flex:3"><label>UTM Norte [m]</label><input type="number" id="${pfx}-utmn" value="${esc(norte||'')}"></div>
    <div class="f" style="flex:3"><label>UTM Este [m]</label><input type="number" id="${pfx}-utme" value="${esc(este||'')}"></div>
    <div class="f" style="flex:1;min-width:54px"><label>Huso</label><input type="text" id="${pfx}-huso" value="${esc(huso||'18')}"></div>
    <button class="btn sm" style="margin-bottom:2px;flex-shrink:0;white-space:nowrap" onclick="capturarGPS('${pfx}')">📍 Captura coordenadas</button>
  </div>`;
}

// ---- RENDERERS ----
const RENDERERS={
  datos_generales(){
    const c=F.contacto,p=F.proyecto;
    return `<div class="sl">Beneficiario</div>
    <div class="fg">
      ${field('Nombre completo','ct-nombre',c.nombre,{full:true})}
      ${field('RUT','ct-rut',c.rut)}
      ${field('Teléfono','ct-tel',c.telefono)}
      ${field('Región','ct-region',c.region,{type:'select',options:REGIONES})}
      ${field('Comuna','ct-comuna',c.comuna)}
      ${field('Sector / Localidad','ct-sector',c.sector)}
    </div>
    <hr class="sep">
    <div class="sl">Proyecto</div>
    <div class="fg">
      ${field('Nombre del proyecto','pr-nombre',p.nombreProyecto,{full:true,placeholder:'Ej: Habilitación pozo y riego por goteo'})}
      ${field('Consultor / Empresa','pr-consultor',p.consultor,{full:true})}
      ${field('ROL de Avalúo SII','pr-rol',p.rolAvaluo,{placeholder:'151-95'})}
      ${field('Sistema de riego principal','pr-sistema',p.sistemaRiego,{type:'select',options:SISTEMA_OPTS})}
      ${field('Sistema secundario','pr-sistema2',p.sistemaSecundario,{type:'select',options:SISTEMA_OPTS})}
      ${field('Sup. Total Predio [ha]','pr-suptot',p.supTotalHa,{type:'number',step:'.01'})}
      ${field('Sup. a Regar [ha]','pr-supregar',p.supRegarHa,{type:'number',step:'.01'})}
    </div>
    <div class="sl" style="margin-top:12px">Coordenadas del proyecto</div>
    ${coordRow('pr',p.coordNorte,p.coordEste,p.huso)}`;
  },

  fuente_tenencia(){
    const f=F.fuente,t=F.tenencia;
    return `<div class="sl">Fuente de agua</div>
    <div class="fg">
      ${field('Tipo fuente de agua','fu-tipo',f.tipo,{type:'select',options:FUENTES_DEFAULT,full:true})}
      ${field('Caudal disponible [l/s]','fu-caudal',f.caudalLs,{type:'number',step:'.01',placeholder:'3.00'})}
      ${field('Hrs. riego/día','fu-horas',f.horasRiegoDia,{type:'number',placeholder:'14'})}
      ${field('Altura de succión [m]','fu-hs',f.alturaSuccion,{type:'number',step:'.1',placeholder:'Desnivel bomba–espejo de agua'})}
      ${field('Diferencia de cota ΔZ [m]','fu-dz',f.deltaZ,{type:'number',step:'.1',placeholder:'Desnivel fuente–punto de riego'})}
      ${field('Características','fu-caract',f.caracteristicas,{full:true,placeholder:'Ej: diámetro, profundidad'})}
      ${field('Observaciones','fu-obs',f.observaciones,{full:true})}
    </div>
    <div class="sl" style="margin-top:12px">Coordenadas punto de captación</div>
    ${coordRow('fu',f.coordNorte,f.coordEste,f.huso)}
    <hr class="sep">
    <div class="sl">Tenencia de tierra y agua</div>
    <div class="fg">
      ${field('Tipo tenencia de la tierra','te-tierra',t.tipoTierra,{type:'select',options:['Propietario/a','Arrendatario/a','Usufructuario/a','Comodatario/a','Sucesión / Herencia','Otro']})}
      ${field('Tipo de derecho de agua','te-derecho',t.tipoDerecho,{type:'select',options:DERECHO_OPTS})}
    </div>`;
  },

  superficie_energia(){
    const a=F.sra,s=F.srf,en=F.energia,ot=F.otros;
    const metodos=['Sin riego','Tendido / Surcos','Manguera','Aspersión','Microaspersión','Goteo','Carrete','Otro'];
    const cults=CULTIVOS_DEFAULT.concat(['Otro']);
    return `<div class="sl">Superficie de riego actual (SRA)</div>
    <div class="fg">
      ${field('Cultivo','sra-cult',a.cultivo,{type:'select',options:cults})}
      ${field('Especifique','sra-cultotro',a.cultivoOtro,{placeholder:'si eligió Otro'})}
      ${field('Superficie [m²]','sra-sup',a.superficieM2,{type:'number'})}
      ${field('Método de riego','sra-met',a.metodo,{type:'select',options:metodos})}
      ${field('Meses que riega','sra-meses',a.meses,{placeholder:'Todo el año'})}
      ${field('Obras existentes','sra-obras',a.obras,{full:true})}
    </div>
    <hr class="sep">
    <div class="sl">Superficie de riego futura (SRF)</div>
    <div class="fg">
      ${field('Cultivo','srf-cult',s.cultivo,{type:'select',options:cults})}
      ${field('Especifique','srf-cultotro',s.cultivoOtro,{placeholder:'si eligió Otro'})}
      ${field('Método proyectado','srf-met',s.metodo,{type:'select',options:metodos})}
      ${field('Meses que regará','srf-meses',s.meses,{placeholder:'Todo el año'})}
      ${field('Obras a ejecutar','srf-obras',s.obras,{full:true})}
    </div>
    <hr class="sep">
    <div class="sl">Energía y otros antecedentes</div>
    <div class="fg">
      ${field('Energía disponible','en-disp',en.tipoDisponible,{type:'select',options:['Eléctrica (red)','Diesel / Bencina','No dispone']})}
      ${field('Energía proyectada','en-proy',en.tipoProyectada,{type:'select',options:['Eléctrica (red)','Fotovoltaica','Diesel / Bencina','Mixta']})}
      ${field('Con inicio de actividades','ot-inicio',ot.inicioActividades,{type:'select',options:SINO})}
      ${field('Proyecto incluye IVA','ot-iva',ot.incluyeIVA,{type:'select',options:SINO})}
      ${field('Usuario INDAP','ot-indap',ot.usuarioIndap,{type:'select',options:SINO})}
      ${field('Notas y observaciones','en-notas',en.notas,{type:'textarea',full:true})}
    </div>`;
  },

  croquis(){
    return `<div class="sl">Croquis esquemático</div>
    <p class="hint" style="margin-bottom:10px">
      1) Toca "Abrir Mapas" → el mapa se abrirá en las coordenadas del proyecto<br>
      2) Toma un screenshot del mapa y vuelve a esta app<br>
      3) Toca "Importar foto de fondo" y elige tu screenshot<br>
      4) Dibuja sobre el mapa con tu dedo
    </p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;align-items:center">
      <button class="btn" onclick="abrirMapas()">🗺 Abrir Mapas</button>
      <input type="file" accept="image/*" id="fondoInput" style="display:none" onchange="setFondo(event)">
      <button class="btn" onclick="document.getElementById('fondoInput').click()">📷 Importar foto de fondo</button>
      <span style="display:flex;gap:6px;align-items:center;margin-left:4px">
        <label style="font-size:.8rem;font-weight:700">Color:</label>
        <button onclick="setLapiz('#000000')" style="width:30px;height:30px;border-radius:50%;background:#000;border:2px solid #999;cursor:pointer"></button>
        <button onclick="setLapiz('#ffffff')" style="width:30px;height:30px;border-radius:50%;background:#fff;border:2px solid #999;cursor:pointer"></button>
        <button onclick="setLapiz('#1e5f9e')" style="width:30px;height:30px;border-radius:50%;background:#1e5f9e;border:2px solid #999;cursor:pointer"></button>
      </span>
      <button class="btn sm" onclick="limpiarDibujo()">✏️ Limpiar dibujo</button>
      <button class="btn sm warn" onclick="limpiarTodo()">🗑 Limpiar todo</button>
    </div>
    <div class="sig-box" style="border-style:solid;position:relative">
      <canvas id="croquisBg" style="position:absolute;inset:0;width:100%;height:100%;display:block"></canvas>
      <canvas id="croquisCanvas" style="width:100%;height:480px;display:block;position:relative;z-index:1"></canvas>
    </div>`;
  },

  fotos(){
    const thumbs=F.fotos.map((p,i)=>`<div class="thumb"><img src="${p.dataUrl}"><button class="rm" onclick="quitarFoto(${i})">✕</button></div>`).join('');
    return `<div class="sl">Fotos referenciales</div>
    <input type="file" accept="image/*" capture="environment" id="fotoInput" style="display:none" onchange="agregarFoto(event)">
    <button class="btn pri" onclick="document.getElementById('fotoInput').click()">📷 Tomar foto</button>
    <div class="thumbs">${thumbs}</div>`;
  },

  anexos(){
    const items=F.anexos.map((a,i)=>`<div class="anexo-item">
      <img src="${a.dataUrl}">
      <div class="info">
        <div style="font-weight:700;font-size:.9rem;margin-bottom:4px">${esc(a.etiqueta||'Sin nombre')}</div>
        <input value="${esc(a.etiqueta)}" onchange="renombrarAnexo(${i},this.value)" placeholder="Renombrar…">
        <button class="btn sm" style="margin-top:6px" onclick="descargarAnexo(${i})">⬇ Descargar</button>
      </div>
      <button class="btn sm warn" onclick="quitarAnexo(${i})">✕</button>
    </div>`).join('');
    return `<div class="sl">Documentos escaneados</div>
    <p class="hint">Ingresa el nombre del documento antes de tomar la foto. Se recortará y enderezará automáticamente. Van incluidos en el .json completo; además puedes descargarlos como imágenes sueltas para subirlos donde corresponda.</p>
    <input type="file" accept="image/*" capture="environment" id="anexoInput" style="display:none" onchange="iniciarEscaneo(event)">
    <button class="btn pri" onclick="pedirNombreYEscanear()">📄 Escanear documento</button>
    ${F.anexos.length?`<button class="btn sm" style="margin-left:8px" onclick="descargarTodosAnexos()">⬇ Descargar todos</button>`:''}
    ${items}`;
  },

  exportar(){
    return `<div class="sl">Guardar / Exportar</div>
    <p class="hint">La ficha se guarda automáticamente al navegar entre pasos.</p>
    <button class="btn" style="width:100%;margin-bottom:8px" onclick="exportarPDF()">📄 Generar ficha PDF</button>
    <button class="btn" style="width:100%;margin-bottom:8px" onclick="exportarJSONCompleto()">⬇ Exportar ficha completa (.json)</button>
    <button class="btn" style="width:100%;margin-bottom:8px" onclick="exportarJSONDisenador()">⬇ Exportar para Diseñador de Riego (.json)</button>`;
  }
};

// ---- Guardar paso + auto-save ----
function guardarPasoActual(){
  const s=STEPS[curStep].id;
  if(s==='datos_generales'){
    const c=F.contacto,p=F.proyecto;
    c.nombre=val('ct-nombre');c.rut=val('ct-rut');c.telefono=val('ct-tel');
    c.region=val('ct-region');c.comuna=val('ct-comuna');c.sector=val('ct-sector');
    p.nombreProyecto=val('pr-nombre');p.consultor=val('pr-consultor');p.rolAvaluo=val('pr-rol');
    p.sistemaRiego=val('pr-sistema');p.sistemaSecundario=val('pr-sistema2');
    p.supTotalHa=val('pr-suptot');p.supRegarHa=val('pr-supregar');
    p.coordNorte=val('pr-utmn');p.coordEste=val('pr-utme');p.huso=val('pr-huso');
    document.getElementById('topTitle').textContent=F.contacto.nombre||'Nueva ficha';
  }else if(s==='fuente_tenencia'){
    const f=F.fuente,t=F.tenencia;
    f.tipo=val('fu-tipo');f.caudalLs=val('fu-caudal');f.horasRiegoDia=val('fu-horas');
    f.alturaSuccion=val('fu-hs');f.deltaZ=val('fu-dz');
    f.caracteristicas=val('fu-caract');f.observaciones=val('fu-obs');
    f.coordNorte=val('fu-utmn');f.coordEste=val('fu-utme');f.huso=val('fu-huso');
    t.tipoTierra=val('te-tierra');t.tipoDerecho=val('te-derecho');
  }else if(s==='superficie_energia'){
    const a=F.sra,sf=F.srf,en=F.energia,ot=F.otros;
    a.cultivo=val('sra-cult');a.cultivoOtro=val('sra-cultotro');a.superficieM2=val('sra-sup');a.metodo=val('sra-met');a.meses=val('sra-meses');a.obras=val('sra-obras');
    sf.cultivo=val('srf-cult');sf.cultivoOtro=val('srf-cultotro');sf.metodo=val('srf-met');sf.meses=val('srf-meses');sf.obras=val('srf-obras');
    en.tipoDisponible=val('en-disp');en.tipoProyectada=val('en-proy');en.notas=val('en-notas');
    ot.inicioActividades=val('ot-inicio');ot.incluyeIVA=val('ot-iva');ot.usuarioIndap=val('ot-indap');
  }
  autoGuardar();
}

// ---- GPS + UTM ----
function capturarGPS(pfx){
  if(!navigator.geolocation){toast('GPS no disponible en este dispositivo');return;}
  toast('Solicitando ubicación…');
  navigator.geolocation.getCurrentPosition(pos=>{
    const u=toUTM(pos.coords.latitude,pos.coords.longitude);
    document.getElementById(pfx+'-utmn').value=u.n;
    document.getElementById(pfx+'-utme').value=u.e;
    document.getElementById(pfx+'-huso').value=u.zone;
    toast('Coordenadas capturadas ✓');
  },err=>{
    if(err.code===1)toast('GPS denegado — iPad: Ajustes › Privacidad › Localización › Safari › Permitir');
    else if(err.code===2)toast('GPS sin señal. Sal al exterior o ingresa manualmente.');
    else toast('Error GPS ('+err.code+')');
  },{enableHighAccuracy:true,timeout:15000});
}
function toUTM(lat,lon){
  const a=6378137,e=0.081819191,k0=0.9996,zone=Math.floor((lon+180)/6)+1;
  const lo=((zone-1)*6-180+3)*Math.PI/180,lr=lat*Math.PI/180,ln=lon*Math.PI/180;
  const es=e*e,ep=es/(1-es),N=a/Math.sqrt(1-es*Math.sin(lr)**2),T=Math.tan(lr)**2,C=ep*Math.cos(lr)**2,A=Math.cos(lr)*(ln-lo);
  const M=a*((1-es/4-3*es**2/64-5*es**3/256)*lr-(3*es/8+3*es**2/32+45*es**3/1024)*Math.sin(2*lr)+(15*es**2/256+45*es**3/1024)*Math.sin(4*lr)-(35*es**3/3072)*Math.sin(6*lr));
  let east=k0*N*(A+(1-T+C)*A**3/6+(5-18*T+T**2+72*C-58*ep)*A**5/120)+500000;
  let north=k0*(M+N*Math.tan(lr)*(A**2/2+(5-T+9*C+4*C**2)*A**4/24+(61-58*T+T**2+600*C-330*ep)*A**6/720));
  if(lat<0)north+=10000000;
  return{n:Math.round(north),e:Math.round(east),zone};
}

// ---- Croquis ----
let _croquisCtx=null, _croquisW=0, _croquisH=0, _croquisDpr=1, _lapizColor='#000000';

function initCroquis(){
  const cv=document.getElementById('croquisCanvas');
  const bg=document.getElementById('croquisBg');
  if(!cv||!bg)return;
  const dpr=window.devicePixelRatio||1;
  const rect=cv.getBoundingClientRect();
  const w=rect.width, h=480;
  cv.width=w*dpr; cv.height=h*dpr;
  bg.width=w*dpr; bg.height=h*dpr;
  const ctx=cv.getContext('2d'); ctx.scale(dpr,dpr);
  _croquisCtx=ctx; _croquisW=w; _croquisH=h; _croquisDpr=dpr;
  ctx.lineWidth=3; ctx.lineCap='round'; ctx.strokeStyle=_lapizColor;

  if(F.croquisFondo){
    const img=new Image();
    img.onload=()=>{
      const bctx=bg.getContext('2d');
      bctx.drawImage(img,0,0,bg.width,bg.height);
      if(F.dibujoEsquematico){const d=new Image();d.onload=()=>ctx.drawImage(d,0,0,w,h);d.src=F.dibujoEsquematico;}
    };img.src=F.croquisFondo;
  }else if(F.dibujoEsquematico){
    const d=new Image();d.onload=()=>ctx.drawImage(d,0,0,w,h);d.src=F.dibujoEsquematico;
  }

  let drawing=false,last=null;
  const pos=e=>{const r=cv.getBoundingClientRect(),p=e.touches?e.touches[0]:e;return{x:p.clientX-r.left,y:p.clientY-r.top};};
  const start=e=>{drawing=true;last=pos(e);e.preventDefault();};
  const move=e=>{
    if(!drawing)return;const p=pos(e);
    ctx.beginPath();ctx.moveTo(last.x,last.y);ctx.lineTo(p.x,p.y);ctx.stroke();last=p;
    e.preventDefault();
  };
  const end=()=>{
    if(!drawing)return;drawing=false;
    // guardar solo el canvas de dibujo
    F.dibujoEsquematico=cv.toDataURL('image/png');
    autoGuardar();
  };
  cv.addEventListener('mousedown',start);cv.addEventListener('mousemove',move);window.addEventListener('mouseup',end);
  cv.addEventListener('touchstart',start,{passive:false});cv.addEventListener('touchmove',move,{passive:false});cv.addEventListener('touchend',end);
}

function esIOS(){
  const ua=navigator.userAgent;
  if(/iP(hone|od)/.test(ua))return true;
  // iPadOS 13+ se reporta como "Macintosh" — se distingue por soporte táctil
  if(/Macintosh/.test(ua)&&navigator.maxTouchPoints>1)return true;
  return /iPad/.test(ua);
}
function abrirMapas(){
  const n=F.proyecto.coordNorte, e=F.proyecto.coordEste;
  const lat=n&&e?utmToLatLon(parseFloat(n),parseFloat(e),parseInt(F.proyecto.huso)||18):null;
  const isIOS=esIOS();
  if(lat){
    const url=isIOS?`maps://?ll=${lat.lat},${lat.lon}&q=Predio&z=17`:`https://maps.google.com/?q=${lat.lat},${lat.lon}&z=17`;
    window.location.href=url;
  }else{
    window.location.href=isIOS?'maps://':'https://maps.google.com/';
    toast('Sin coordenadas — abre en tu ubicación actual');
  }
}
// Conversión inversa UTM → lat/lon (para abrir Maps)
function utmToLatLon(N,E,zone){
  const a=6378137,e=0.081819191,k0=0.9996;
  const x=E-500000,es=e*e;
  const e1=(1-Math.sqrt(1-es))/(1+Math.sqrt(1-es));
  const M=N/k0;
  const mu=M/(a*(1-es/4-3*es**2/64-5*es**3/256));
  const phi1=mu+(3*e1/2-27*e1**3/32)*Math.sin(2*mu)+(21*e1**2/16-55*e1**4/32)*Math.sin(4*mu)+(151*e1**3/96)*Math.sin(6*mu);
  const ep2=es/(1-es),N1=a/Math.sqrt(1-es*Math.sin(phi1)**2),T1=Math.tan(phi1)**2,C1=ep2*Math.cos(phi1)**2,R1=a*(1-es)/Math.pow(1-es*Math.sin(phi1)**2,1.5),D=x/(N1*k0);
  const lat=phi1-(N1*Math.tan(phi1)/R1)*(D**2/2-(5+3*T1+10*C1-4*C1**2-9*ep2)*D**4/24+(61+90*T1+298*C1+45*T1**2-252*ep2-3*C1**2)*D**6/720);
  const lon=((zone-1)*6-180+3)*Math.PI/180+(D-(1+2*T1+C1)*D**3/6+(5-2*C1+28*T1-3*C1**2+8*ep2+24*T1**2)*D**5/120)/Math.cos(phi1);
  return{lat:lat*180/Math.PI,lon:lon*180/Math.PI};
}

function setFondo(ev){
  const file=ev.target.files[0];if(!file)return;
  const r=new FileReader();r.onload=e=>{
    const img=new Image();img.onload=()=>{
      const bg=document.getElementById('croquisBg');if(!bg)return;
      const ctx=bg.getContext('2d');
      ctx.clearRect(0,0,bg.width,bg.height);
      // cubrir todo el canvas manteniendo proporción (estilo "cover")
      const cw=bg.width, ch=bg.height, ir=img.width/img.height, cr=cw/ch;
      let dw,dh,dx,dy;
      if(ir>cr){dh=ch;dw=ch*ir;dx=(cw-dw)/2;dy=0;}else{dw=cw;dh=cw/ir;dx=0;dy=(ch-dh)/2;}
      ctx.drawImage(img,dx,dy,dw,dh);
      F.croquisFondo=bg.toDataURL('image/jpeg',.85);
      if(_croquisCtx){_croquisCtx.clearRect(0,0,_croquisW,_croquisH);F.dibujoEsquematico='';}
      autoGuardar();toast('Fondo cargado ✓');
    };img.src=e.target.result;
  };r.readAsDataURL(file);ev.target.value='';
}
function setLapiz(color){_lapizColor=color;if(_croquisCtx)_croquisCtx.strokeStyle=color;}
function limpiarDibujo(){
  if(!_croquisCtx)return;
  _croquisCtx.clearRect(0,0,_croquisW,_croquisH);
  F.dibujoEsquematico='';autoGuardar();
}
function limpiarTodo(){
  if(!confirm('¿Limpiar fondo y dibujo?'))return;
  const bg=document.getElementById('croquisBg');
  if(bg)bg.getContext('2d').clearRect(0,0,bg.width,bg.height);
  if(_croquisCtx)_croquisCtx.clearRect(0,0,_croquisW,_croquisH);
  F.croquisFondo='';F.dibujoEsquematico='';autoGuardar();
}

// ---- Fotos ----
function fileToDataUrl(file){return new Promise(res=>{const img=new Image(),r=new FileReader();r.onload=e=>{img.onload=()=>{const max=1600;let w=img.width,h=img.height;if(w>h&&w>max){h=h*max/w;w=max;}else if(h>max){w=w*max/h;h=max;}const cv=document.createElement('canvas');cv.width=w;cv.height=h;cv.getContext('2d').drawImage(img,0,0,w,h);res(cv.toDataURL('image/jpeg',.82));};img.src=e.target.result;};r.readAsDataURL(file);});}
async function agregarFoto(ev){const file=ev.target.files[0];if(!file)return;F.fotos.push({id:uuid(),dataUrl:await fileToDataUrl(file)});ev.target.value='';autoGuardar();renderStep();}
function quitarFoto(i){F.fotos.splice(i,1);autoGuardar();renderStep();}

// ---- Escaneo ----
let _cropImg=null,_cropPts=null,_cropCv=null,_anexoNombre='';
function pedirNombreYEscanear(){
  const n=prompt('Nombre del documento:\n(ej: RUT, Escritura, DAA, Certificado)','');
  if(n===null)return;_anexoNombre=n.trim()||'Documento';
  document.getElementById('anexoInput').click();
}
function iniciarEscaneo(ev){
  const file=ev.target.files[0];if(!file)return;
  const r=new FileReader();r.onload=e=>{const img=new Image();img.onload=()=>{_cropImg=img;abrirCrop(img);};img.src=e.target.result;};r.readAsDataURL(file);ev.target.value='';
}
function abrirCrop(img){
  document.getElementById('cropModal').style.display='flex';
  const maxW=Math.min(window.innerWidth-40,560),scale=Math.min(maxW/img.width,1);
  const w=img.width*scale,h=img.height*scale;
  const cv=document.getElementById('cropCanvas');cv.width=w;cv.height=h;
  cv.getContext('2d').drawImage(img,0,0,w,h);_cropCv=cv;
  const m=.06;_cropPts=[{x:w*m,y:h*m},{x:w*(1-m),y:h*m},{x:w*(1-m),y:h*(1-m)},{x:w*m,y:h*(1-m)}];
  drawHandles();
}
function drawHandles(){
  document.querySelectorAll('.handle').forEach(h=>h.remove());
  const wrap=document.getElementById('cropWrap');
  _cropPts.forEach(p=>{
    const h=document.createElement('div');h.className='handle';h.style.left=p.x+'px';h.style.top=p.y+'px';
    let drag=false;
    const mv=e=>{if(!drag)return;const r=_cropCv.getBoundingClientRect(),pt=e.touches?e.touches[0]:e;p.x=Math.max(0,Math.min(_cropCv.width,pt.clientX-r.left));p.y=Math.max(0,Math.min(_cropCv.height,pt.clientY-r.top));h.style.left=p.x+'px';h.style.top=p.y+'px';redrawOutline();e.preventDefault();};
    h.addEventListener('mousedown',()=>drag=true);window.addEventListener('mousemove',mv);window.addEventListener('mouseup',()=>drag=false);
    h.addEventListener('touchstart',e=>{drag=true;e.preventDefault();},{passive:false});h.addEventListener('touchmove',mv,{passive:false});h.addEventListener('touchend',()=>drag=false);
    wrap.appendChild(h);
  });redrawOutline();
}
function redrawOutline(){const cv=_cropCv,ctx=cv.getContext('2d');ctx.drawImage(_cropImg,0,0,cv.width,cv.height);ctx.strokeStyle='#2f7dc4';ctx.lineWidth=2;ctx.beginPath();_cropPts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.stroke();}
function cancelCrop(){document.getElementById('cropModal').style.display='none';}
function solve(A,b){const n=A.length,M=A.map((r,i)=>r.concat([b[i]]));for(let i=0;i<n;i++){let m=i;for(let k=i+1;k<n;k++)if(Math.abs(M[k][i])>Math.abs(M[m][i]))m=k;[M[i],M[m]]=[M[m],M[i]];for(let k=i+1;k<n;k++){const f=M[k][i]/M[i][i];for(let j=i;j<=n;j++)M[k][j]-=f*M[i][j];}}const x=new Array(n).fill(0);for(let i=n-1;i>=0;i--){let s=M[i][n];for(let j=i+1;j<n;j++)s-=M[i][j]*x[j];x[i]=s/M[i][i];}return x;}
function homog(src,dst){const A=[];for(let i=0;i<4;i++){const{x:sx,y:sy}=src[i],{x:dx,y:dy}=dst[i];A.push([sx,sy,1,0,0,0,-dx*sx,-dx*sy]);A.push([0,0,0,sx,sy,1,-dy*sx,-dy*sy]);}const h=solve(A,dst.flatMap(p=>[p.x,p.y]));return[...h,1];}
function applyCrop(){
  const p=_cropPts,d=v=>Math.hypot(v[0].x-v[1].x,v[0].y-v[1].y);
  const W=Math.round(Math.max(d([p[0],p[1]]),d([p[3],p[2]]))),H=Math.round(Math.max(d([p[0],p[3]]),d([p[1],p[2]])));
  const sx=_cropImg.width/_cropCv.width,sy=_cropImg.height/_cropCv.height;
  const src=p.map(pt=>({x:pt.x*sx,y:pt.y*sy})),dst=[{x:0,y:0},{x:W,y:0},{x:W,y:H},{x:0,y:H}];
  const H2=homog(dst,src);
  const sc=document.createElement('canvas');sc.width=_cropImg.width;sc.height=_cropImg.height;sc.getContext('2d').drawImage(_cropImg,0,0);
  const sd=sc.getContext('2d').getImageData(0,0,sc.width,sc.height).data,sw=sc.width;
  const oc=document.createElement('canvas');oc.width=W;oc.height=H;
  const oct=oc.getContext('2d'),od=oct.createImageData(W,H);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const den=H2[6]*x+H2[7]*y+H2[8],sx2=(H2[0]*x+H2[1]*y+H2[2])/den,sy2=(H2[3]*x+H2[4]*y+H2[5])/den,io=(y*W+x)*4;
    if(sx2>=0&&sx2<sw-1&&sy2>=0&&sy2<sc.height-1){const x0=Math.floor(sx2),y0=Math.floor(sy2),fx=sx2-x0,fy=sy2-y0;for(let c=0;c<3;c++){const p00=sd[(y0*sw+x0)*4+c],p10=sd[(y0*sw+x0+1)*4+c],p01=sd[((y0+1)*sw+x0)*4+c],p11=sd[((y0+1)*sw+x0+1)*4+c];od.data[io+c]=p00+(p10-p00)*fx+(p01-p00)*fy+(p11-p10-p01+p00)*fx*fy;}od.data[io+3]=255;}
    else{od.data[io]=od.data[io+1]=od.data[io+2]=255;od.data[io+3]=255;}
  }
  oct.putImageData(od,0,0);
  F.anexos.push({id:uuid(),etiqueta:_anexoNombre,dataUrl:oc.toDataURL('image/jpeg',.86)});
  document.getElementById('cropModal').style.display='none';autoGuardar();renderStep();
}
function renombrarAnexo(i,v){F.anexos[i].etiqueta=v;autoGuardar();}
function quitarAnexo(i){F.anexos.splice(i,1);autoGuardar();renderStep();}
function descargarAnexo(i){const a=F.anexos[i];const l=document.createElement('a');l.href=a.dataUrl;l.download=(a.etiqueta||'anexo').replace(/[^\w\s-]/g,'')+'_'+(i+1)+'.jpg';l.click();}
function descargarTodosAnexos(){
  if(!F.anexos.length){toast('No hay anexos');return;}
  F.anexos.forEach((a,i)=>{
    setTimeout(()=>{
      const l=document.createElement('a');l.href=a.dataUrl;
      l.download=(a.etiqueta||'anexo').replace(/[^\w\s-]/g,'')+'_'+(i+1)+'.jpg';
      document.body.appendChild(l);l.click();l.remove();
    }, i*400); // espaciado para que el navegador no bloquee descargas múltiples
  });
  toast('Descargando '+F.anexos.length+' anexo(s)…');
}

// ---- JSON ----
function nombreBase(){return((F.contacto.nombre||'ficha').trim().replace(/\s+/g,'_').replace(/[^\w-]/g,'')||'ficha')+'_'+F.fecha;}
function descargar(nombre,txt,mime){const b=new Blob([txt],{type:mime}),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=nombre;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(u);a.remove();},1500);}
function exportarJSONCompleto(){guardarPasoActual();descargar(nombreBase()+'.json',JSON.stringify(F,null,2),'application/json');toast('JSON exportado');}
function exportarJSONDisenador(){
  guardarPasoActual();
  const sys=F.proyecto.sistemaRiego;if(!sys){toast('Selecciona el sistema de riego principal en Datos generales');return;}
  const pfx=PFX[sys],p=F.proyecto,c=F.contacto,fu=F.fuente,te=F.tenencia,sf=F.srf;
  const cult=sf.cultivo==='Otro'?sf.cultivoOtro:sf.cultivo;
  const fields={};
  fields[pfx+'-consultor']=p.consultor||'';fields[pfx+'-nombre-proy']=p.nombreProyecto||'';
  fields[pfx+'-prop']=c.nombre||'';fields[pfx+'-rol']=p.rolAvaluo||'';
  fields[pfx+'-sec']=c.sector||'';fields[pfx+'-com']=c.comuna||'';
  fields[pfx+'-huso']=p.huso||'';fields[pfx+'-utmn']=p.coordNorte||'';fields[pfx+'-utme']=p.coordEste||'';
  const supId=DR_SUP[sys];if(supId)fields[supId]=p.supRegarHa||'';
  if(sys==='asp'&&p.supTotalHa)fields['a-sttot']=p.supTotalHa;
  fields[pfx+'-cult']=cult||'';fields[pfx+'-tfue']=fu.tipo||'';
  fields[pfx+'-der-tipo']=te.tipoDerecho||'';fields[pfx+'-q']=fu.caudalLs||'';fields[pfx+'-hrs']=fu.horasRiegoDia||'';
  fields[pfx+'-hs']=fu.alturaSuccion||'';fields[pfx+'-dz']=fu.deltaZ||'';
  descargar(nombreBase()+'_Disenador_'+SISTEMA_MAP[sys]+'.json',JSON.stringify({__sys:sys,__name:p.nombreProyecto||c.nombre||'Proyecto',__date:new Date().toLocaleString('es-CL'),fields},null,2),'application/json');
  toast('JSON para Diseñador exportado');
}

// ---- PDF ----
function cerrarPDF(){const o=document.getElementById('pdfOverlay');if(o)o.remove();}
function exportarPDF(){
  guardarPasoActual();
  const F_=F,c=F_.contacto,p=F_.proyecto,fu=F_.fuente,te=F_.tenencia,a=F_.sra,sf=F_.srf,en=F_.energia,ot=F_.otros;
  const cult=v=>v&&v.cultivo==='Otro'?v.cultivoOtro:(v?v.cultivo:'');
  const L='background:#edf3f9;font-weight:700;padding:5px 8px;border:1px solid #b8c9db;width:24%;font-size:10px',
        V='background:#fff;padding:5px 8px;border:1px solid #b8c9db;font-size:10.5px',
        H='background:#1e3a5f;color:#fff;font-weight:700;padding:5px 8px;border:1px solid #0b2545;text-align:center;font-size:10px',
        K='background:#edf3f9;font-weight:600;padding:5px 8px;border:1px solid #b8c9db;font-size:10px',
        D='background:#fff;padding:5px 8px;border:1px solid #b8c9db;text-align:center;font-size:10.5px';
  const sec=t=>`<div style="background:#1e3a5f;color:#fff;font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:.04em;padding:5px 8px;margin-top:10px">${t}</div>`;
  const tbl=(...rows)=>`<table style="width:100%;border-collapse:collapse">${rows.join('')}</table>`;
  const row=(l,v,l2,v2)=>l2!==undefined?`<tr><td style="${L}">${l}</td><td style="${V}">${esc(v)}</td><td style="${L}">${l2}</td><td style="${V}">${esc(v2)}</td></tr>`:`<tr><td style="${L}">${l}</td><td style="${V}" colspan="3">${esc(v)}</td></tr>`;
  const coord=(n,e,h)=>n?`N ${n} · E ${e} · H ${h}`:'—';

  // croquis: compositar fondo + dibujo para PDF
  let croquisUrl='';
  if(F_.croquisFondo||F_.dibujoEsquematico){
    const cv=document.createElement('canvas');cv.width=800;cv.height=600;
    const ctx=cv.getContext('2d');
    const drawLayers=()=>{croquisUrl=cv.toDataURL('image/jpeg',.85);};
    if(F_.croquisFondo){const i=new Image();i.onload=()=>{ctx.drawImage(i,0,0,800,600);if(F_.dibujoEsquematico){const j=new Image();j.onload=()=>{ctx.drawImage(j,0,0,800,600);drawLayers();};j.src=F_.dibujoEsquematico;}else drawLayers();};i.src=F_.croquisFondo;}
    else if(F_.dibujoEsquematico){const i=new Image();i.onload=()=>{ctx.drawImage(i,0,0,800,600);drawLayers();};i.src=F_.dibujoEsquematico;}
  }

  const html=`<div style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:720px;margin:0 auto">
  <h2 style="text-align:center;margin:0 0 2px;font-size:14px">FICHA VISITA TERRENO</h2>
  <p style="text-align:center;margin:0 0 6px;font-size:11px">Para levantamiento de demanda</p>
  <div style="display:flex;justify-content:space-between;font-size:10.5px;margin-bottom:4px">
    <span><b>Fecha:</b> ${esc(F_.fecha)}</span>
  </div>
  ${sec('Beneficiario')}
  ${tbl(row('Nombre',c.nombre,'RUT',c.rut),row('Teléfono',c.telefono,'Región',c.region),row('Comuna',c.comuna,'Sector / Localidad',c.sector))}
  ${sec('Proyecto')}
  ${tbl(row('Nombre del proyecto',p.nombreProyecto),
    row('Consultor / Empresa',p.consultor,'ROL de Avalúo (SII)',p.rolAvaluo),row('Sistema principal',SISTEMA_MAP[p.sistemaRiego]||'—','Sistema secundario',SISTEMA_MAP[p.sistemaSecundario]||'—'),row('Sup. Total / Sup. a Regar [ha]',(p.supTotalHa||'—')+' / '+(p.supRegarHa||'—'),'Coordenadas proyecto',coord(p.coordNorte,p.coordEste,p.huso)))}
  ${sec('1. Fuente de agua')}
  ${tbl(row('Tipo fuente',fu.tipo,'Coord. captación',coord(fu.coordNorte,fu.coordEste,fu.huso)),row('Caudal disponible [l/s]',fu.caudalLs||'—','Hrs. de riego/día',fu.horasRiegoDia||'—'),row('Altura succión [m]',fu.alturaSuccion||'—','Diferencia de cota ΔZ [m]',fu.deltaZ||'—'),row('Características',fu.caracteristicas,'Observaciones',fu.observaciones))}
  ${sec('2. Tenencia de tierra y agua')}
  ${tbl(row('Tipo tenencia de la tierra',te.tipoTierra,'Tipo de derecho de agua',te.tipoDerecho))}
  ${sec('3. Superficie de riego')}
  <table style="width:100%;border-collapse:collapse">
    <tr><td style="${K}"></td><td style="${H}">SRA — Superficie actual</td><td style="${H}">SRF — Superficie futura</td></tr>
    <tr><td style="${K}">Cultivo</td><td style="${D}">${esc(cult(a))}</td><td style="${D}">${esc(cult(sf))}</td></tr>
    <tr><td style="${K}">Superficie [m²]</td><td style="${D}">${esc(a.superficieM2)}</td><td style="${D}">${esc(p.supRegarHa?p.supRegarHa+' ha':'—')}</td></tr>
    <tr><td style="${K}">Método de riego</td><td style="${D}">${esc(a.metodo)}</td><td style="${D}">${esc(sf.metodo)}</td></tr>
    <tr><td style="${K}">Meses</td><td style="${D}">${esc(a.meses)}</td><td style="${D}">${esc(sf.meses)}</td></tr>
    <tr><td style="${K}">Obras</td><td style="${D}">${esc(a.obras)}</td><td style="${D}">${esc(sf.obras)}</td></tr>
  </table>
  ${sec('4. Energía y otros antecedentes')}
  ${tbl(row('Energía disponible',en.tipoDisponible,'Energía proyectada',en.tipoProyectada),row('Con inicio de actividades',ot.inicioActividades,'Incluye IVA',ot.incluyeIVA),row('Usuario INDAP',ot.usuarioIndap,'Notas',en.notas))}
  ${(F_.croquisFondo||F_.dibujoEsquematico)?`<div class="pbreak">${sec('Croquis / Esquema')}<div id="pdfCroquis" style="margin-top:6px;border:1px solid #b8c9db"></div></div>`:''}
  ${F_.fotos.length?`<div class="pbreak">${sec('Fotos referenciales')}<div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:8px">${F_.fotos.map(f=>`<img src="${f.dataUrl}" style="width:calc(50% - 5px);border:1px solid #b8c9db;border-radius:4px">`).join('')}</div></div>`:''}
  ${F_.anexos.length?`<div class="pbreak">${sec('Documentos anexos')}<div style="display:flex;flex-wrap:wrap;gap:16px;margin-top:8px">${F_.anexos.map((ax,i)=>`<div style="width:calc(50% - 8px);page-break-inside:avoid;margin-bottom:12px"><div style="font-weight:700;font-size:10.5px;margin-bottom:4px">${i+1}. ${esc(ax.etiqueta||'Documento')}</div><img src="${ax.dataUrl}" style="width:100%;border:1px solid #b8c9db;border-radius:4px"></div>`).join('')}</div></div>`:''}
</div>`;

  const old=document.getElementById('pdfOverlay');if(old)old.remove();
  const overlay=document.createElement('div');overlay.id='pdfOverlay';overlay.className='pdf-overlay';
  overlay.innerHTML=`<div class="pdf-bar"><button class="btn pri" onclick="window.print()">🖨 Imprimir / Guardar PDF</button><button class="btn" onclick="cerrarPDF()">✕ Cerrar</button></div><div id="pdfContent">${html}</div>`;
  document.body.appendChild(overlay);

  // insertar croquis compuesto en el PDF
  if(F_.croquisFondo||F_.dibujoEsquematico){
    const cont=overlay.querySelector('#pdfCroquis');if(!cont)return;
    const cv=document.createElement('canvas');cv.width=800;cv.height=600;cv.style.width='100%';
    const ctx=cv.getContext('2d');cont.appendChild(cv);
    const finish=()=>{if(F_.dibujoEsquematico){const j=new Image();j.onload=()=>ctx.drawImage(j,0,0,800,600);j.src=F_.dibujoEsquematico;}};
    if(F_.croquisFondo){const i=new Image();i.onload=()=>{ctx.drawImage(i,0,0,800,600);finish();};i.src=F_.croquisFondo;}
    else finish();
  }
}

// ---- Init ----
(async()=>{
  await idbOpen();await goHome();
  if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
})();
