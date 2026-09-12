// ============================================================
// Ficha de Terreno — Levantamiento de demanda (riego)
// App offline (IndexedDB) — exporta JSON compatible con Diseñador de Riego
// ============================================================

// ---------- Catálogos (idénticos a los de Diseñador de Riego v129, para compatibilidad directa) ----------
const CULTIVOS_DEFAULT = ['Alfalfa','Pradera / Ballica','Maíz','Papa','Cebada','Trigo','Remolacha','Hortalizas','Frutales','Vides','Flores'];
const FUENTES_DEFAULT = ['Canal de riego','Río / Estero','Lago / Laguna','Pozo profundo','Pozo noria','Pozo zanja','Puntera (wellpoint)','Pozo sondaje (tubería de revestimiento)','Estanque acumulador','Tranque predial','Embalse','Vertiente intrapredial','Aguas lluvia (acumulación)'];
const DERECHO_OPCIONES = [
  {v:'permanente', l:'Permanente — inscrito en CBR'},
  {v:'eventual', l:'Eventual — inscrito en CBR'},
  {v:'no-inscrito-lluvia', l:'No inscrito — Art. 10 (Aguas lluvia)'},
  {v:'no-inscrito-vertiente', l:'No inscrito — Art. 20 (Vertiente/laguna)'},
  {v:'no-inscrito-art56', l:'No inscrito — Art. 56 (Consumo humano / PEPA)'}
];
const SISTEMA_OPCIONES = [
  {v:'got', l:'Goteo'}, {v:'asp', l:'Aspersión'}, {v:'mic', l:'Microaspersión'}, {v:'car', l:'Carrete'}
];
// Mapa canónico -> id de campo en Diseñador de Riego, por prefijo de sistema
const PFX = {got:'g', asp:'a', mic:'m', car:'c'};
// campos comunes a los 4 sistemas en Diseñador (sufijo tras el prefijo)
const DR_FIELD_MAP = {
  consultor:'-consultor', nombreProyecto:'-nombre-proy', propietario:'-prop', rol:'-rol',
  sector:'-sec', comuna:'-com', huso:'-huso', utmNorte:'-utmn', utme:'-utme',
  cultivo:'-cult', tipoFuente:'-tfue', tipoDerecho:'-der-tipo', caudalLs:'-q', horasRiegoDia:'-hrs'
};
// sup. total / sup. a regar tienen ids distintos por sistema en Diseñador
const DR_SUP_TOTAL = {asp:'a-sttot', got:null, mic:null, car:null}; // solo Aspersión trae "Sup. Total Predio" propio; los demás usan -sup / -strie / -supr
const DR_SUP_REGAR = {asp:'a-strie', car:'c-supr', got:'g-sup', mic:'m-sup'};

// ---------- IndexedDB ----------
let DB;
function idbOpen(){
  return new Promise((res,rej)=>{
    const req = indexedDB.open('fichaTerrenoDB', 1);
    req.onupgradeneeded = e=>{
      const db = e.target.result;
      if(!db.objectStoreNames.contains('fichas')) db.createObjectStore('fichas',{keyPath:'id'});
    };
    req.onsuccess = e=>{ DB=e.target.result; res(DB); };
    req.onerror = e=> rej(e);
  });
}
function idbPut(ficha){
  return new Promise((res,rej)=>{
    const tx = DB.transaction('fichas','readwrite');
    tx.objectStore('fichas').put(ficha);
    tx.oncomplete=()=>res(); tx.onerror=e=>rej(e);
  });
}
function idbDelete(id){
  return new Promise((res,rej)=>{
    const tx = DB.transaction('fichas','readwrite');
    tx.objectStore('fichas').delete(id);
    tx.oncomplete=()=>res(); tx.onerror=e=>rej(e);
  });
}
function idbGetAll(){
  return new Promise((res,rej)=>{
    const tx = DB.transaction('fichas','readonly');
    const req = tx.objectStore('fichas').getAll();
    req.onsuccess=()=>res(req.result||[]); req.onerror=e=>rej(e);
  });
}

// ---------- Estado ----------
let F = null; // ficha actual en edición
let curStep = 0;

function uuid(){ return 'f'+Date.now().toString(36)+Math.random().toString(36).slice(2,8); }

function blankFicha(){
  return {
    id: uuid(), fecha: new Date().toISOString().slice(0,10), creado: Date.now(), modificado: Date.now(),
    contacto:{ nombre:'', rut:'', telefono:'', email:'', nGrupoFamiliar:'', region:'', comuna:'', sector:'',
      genero:'', puebloOriginario:'No', puebloCual:'', aporteDinero:false, aporteBienes:false, aporteManoObra:false,
      agricultorInteresado:'Si' },
    proyecto:{ nombreProyecto:'', consultor:'', rolAvaluo:'', sistemaRiego:'', supTotalHa:'', supRegarHa:'',
      coordNorte:'', coordEste:'', huso:'18' },
    fuente:{ tipo:'', coordNorte:'', coordEste:'', huso:'18', caracteristicas:'', observaciones:'',
      caudalLs:'', horasRiegoDia:'' },
    tenencia:{ tipoTierra:'', docTierra:'Si', tipoDerecho:'', docAgua:'Si' },
    corrobActual:{ cultivo:'', cultivoOtro:'', superficieM2:'', metodo:'', meses:'', obras:'' },
    corrobProyecto:{ cultivo:'', cultivoOtro:'', superficieM2:'', metodo:'', meses:'', obras:'' },
    energia:{ tipoDisponible:'', tipoProyectada:'', observaciones:'' },
    otros:{ inicioActividades:'No', incluyeIVA:'Si', participaINDAP:'Si', descripcion:'' },
    encuestador:{ nombre:'', cargo:'', datosContacto:'', conConsultor:'No', nombreConsultor:'' },
    firmaEncuestador:'', firmaBeneficiario:'', dibujoEsquematico:'',
    fotos:[], anexos:[]
  };
}

// ---------- UI: toast ----------
function toast(msg){
  const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('on');
  clearTimeout(toast._t); toast._t=setTimeout(()=>t.classList.remove('on'),2200);
}

// ---------- Home / listado ----------
async function goHome(){
  document.getElementById('home').style.display='block';
  document.getElementById('editor').style.display='none';
  document.getElementById('btnBack').style.display='none';
  document.getElementById('fabNew').style.display='block';
  document.getElementById('topTitle').textContent='Ficha de Terreno';
  await renderLista();
}
async function renderLista(){
  const fichas = (await idbGetAll()).sort((a,b)=>b.modificado-a.modificado);
  const el = document.getElementById('listaFichas');
  document.getElementById('emptyMsg').style.display = fichas.length? 'none':'block';
  el.innerHTML = fichas.map(f=>`
    <div class="list-item">
      <div onclick="abrirFicha('${f.id}')" style="flex:1;cursor:pointer">
        <div style="font-weight:700">${f.contacto.nombre || '(sin nombre)'}</div>
        <div class="meta">${f.fecha} · ${f.contacto.comuna||''} ${f.contacto.sector? '· '+f.contacto.sector:''}</div>
      </div>
      <button class="btn sm" onclick="abrirFicha('${f.id}')">Abrir</button>
      <button class="btn sm warn" onclick="borrarFicha('${f.id}')">Eliminar</button>
    </div>`).join('');
}
async function borrarFicha(id){
  if(!confirm('¿Eliminar esta ficha? No se puede deshacer.')) return;
  await idbDelete(id); toast('Ficha eliminada'); renderLista();
}
function nuevaFicha(){ F = blankFicha(); curStep = 0; abrirEditor(); }
async function abrirFicha(id){
  const fichas = await idbGetAll();
  F = fichas.find(f=>f.id===id); curStep = 0; abrirEditor();
}
function abrirEditor(){
  document.getElementById('home').style.display='none';
  document.getElementById('editor').style.display='block';
  document.getElementById('btnBack').style.display='inline-block';
  document.getElementById('fabNew').style.display='none';
  document.getElementById('topTitle').textContent = F.contacto.nombre || 'Nueva ficha';
  renderPills(); renderStep();
}

// ---------- Definición de pasos ----------
const STEPS = [
  {id:'contacto', t:'Contacto'},
  {id:'proyecto', t:'Proyecto'},
  {id:'fuente', t:'Fuente agua'},
  {id:'tenencia', t:'Tenencia'},
  {id:'corrob', t:'Caudal'},
  {id:'energia', t:'Energía'},
  {id:'otros', t:'Otros datos'},
  {id:'encuestador', t:'Encuestador'},
  {id:'firmas', t:'Firmas'},
  {id:'croquis', t:'Croquis'},
  {id:'fotos', t:'Fotos'},
  {id:'anexos', t:'Anexos'},
  {id:'exportar', t:'Guardar / Exportar'}
];
function renderPills(){
  document.getElementById('pillNav').innerHTML = STEPS.map((s,i)=>
    `<button class="pill ${i===curStep?'on':''}" onclick="irPaso(${i})">${i+1}. ${s.t}</button>`).join('');
}
function irPaso(i){ guardarPasoActual(); curStep=i; renderPills(); renderStep(); }

function renderStep(){
  const s = STEPS[curStep];
  const el = document.getElementById('stepsWrap');
  el.innerHTML = `<div class="card">${RENDERERS[s.id]()}</div>
    <div class="navbtns">
      <button class="btn" onclick="pasoAnterior()" ${curStep===0?'disabled':''}>‹ Anterior</button>
      <button class="btn pri" onclick="pasoSiguiente()">${curStep===STEPS.length-1?'Finalizar':'Siguiente ›'}</button>
    </div>`;
  if(s.id==='firmas') setTimeout(initFirmas,0);
  if(s.id==='croquis') setTimeout(initCroquis,0);
}
function pasoAnterior(){ guardarPasoActual(); if(curStep>0){curStep--; renderPills(); renderStep();} }
async function pasoSiguiente(){
  guardarPasoActual();
  if(curStep<STEPS.length-1){ curStep++; renderPills(); renderStep(); }
  else { await guardarFicha(); toast('Ficha guardada'); }
}
async function guardarFicha(){
  F.modificado = Date.now();
  await idbPut(F);
}

// ---------- Helpers de formulario genérico ----------
function val(id){ const e=document.getElementById(id); if(!e) return undefined; if(e.type==='checkbox') return e.checked; return e.value; }
function setv(obj,key,id){ const v=val(id); if(v!==undefined) obj[key]=v; }

function field(label,id,value,opts={}){
  const type=opts.type||'text';
  if(type==='select'){
    const options=(opts.options||[]).map(o=>{
      const ov = typeof o==='string'? o : o.v; const ol = typeof o==='string'? o : o.l;
      return `<option value="${esc(ov)}" ${ov===value?'selected':''}>${esc(ol)}</option>`;
    }).join('');
    return `<div class="f ${opts.full?'full':''}"><label>${label}</label><select id="${id}">${opts.placeholder?`<option value="">—</option>`:''}${options}</select></div>`;
  }
  if(type==='textarea'){
    return `<div class="f ${opts.full?'full':''}"><label>${label}</label><textarea id="${id}" placeholder="${esc(opts.placeholder||'')}">${esc(value||'')}</textarea></div>`;
  }
  if(type==='radio'){
    return `<div class="f ${opts.full?'full':''}"><label>${label}</label><div class="chk-row">${(opts.options||['Si','No']).map(o=>
      `<label class="chk"><input type="radio" name="${id}" value="${o}" ${value===o?'checked':''} onchange="document.getElementById('${id}_hidden').value='${o}'"> ${o}</label>`).join('')}
      <input type="hidden" id="${id}_hidden" value="${esc(value||'')}"></div></div>`;
  }
  return `<div class="f ${opts.full?'full':''}"><label>${label}</label><input type="${type}" id="${id}" value="${esc(value||'')}" placeholder="${esc(opts.placeholder||'')}" ${opts.step?`step="${opts.step}"`:''}></div>`;
}
function radioVal(id){ const h=document.getElementById(id+'_hidden'); return h? h.value : undefined; }
function esc(s){ return String(s==null?'':s).replace(/"/g,'&quot;'); }

// ---------- RENDERERS por paso ----------
const RENDERERS = {
  contacto(){
    const c=F.contacto;
    return `<div class="sl">Información de contacto</div>
    <div class="fg">
      ${field('Nombre completo','ct-nombre',c.nombre,{full:true})}
      ${field('RUT','ct-rut',c.rut)}
      ${field('Teléfono','ct-tel',c.telefono)}
      ${field('E-mail','ct-mail',c.email,{full:true})}
      ${field('N° Grupo Familiar','ct-ngf',c.nGrupoFamiliar,{type:'number'})}
      ${field('Región','ct-region',c.region)}
      ${field('Comuna','ct-comuna',c.comuna)}
      ${field('Sector','ct-sector',c.sector)}
      ${field('Género','ct-genero',c.genero,{type:'select',options:['Femenino','Masculino'],placeholder:true})}
      ${field('¿Pertenece a Pueblo Originario?','ct-pueblo',c.puebloOriginario,{type:'radio'})}
      ${field('¿Cuál pueblo?','ct-pueblocual',c.puebloCual)}
    </div>
    <hr class="sep">
    <div class="sl">Aporte del postulante</div>
    <div class="chk-row">
      <label class="chk"><input type="checkbox" id="ct-apdinero" ${c.aporteDinero?'checked':''}> En dinero</label>
      <label class="chk"><input type="checkbox" id="ct-apbienes" ${c.aporteBienes?'checked':''}> En bienes comprados</label>
      <label class="chk"><input type="checkbox" id="ct-apmano" ${c.aporteManoObra?'checked':''}> En mano de obra</label>
    </div>
    <hr class="sep">
    ${field('¿Agricultor/a interesado en participar?','ct-interes',c.agricultorInteresado,{type:'radio'})}
    `;
  },
  proyecto(){
    const p=F.proyecto;
    return `<div class="sl">Identificación del proyecto <span class="badge">para Diseñador</span></div>
    <div class="fg">
      ${field('Nombre del Proyecto','pr-nombre',p.nombreProyecto,{full:true,placeholder:'Ej: Habilitación de pozo y riego por goteo'})}
      ${field('Nombre del Consultor / Empresa','pr-consultor',p.consultor,{full:true})}
      ${field('ROL de Avalúo (SII)','pr-rol',p.rolAvaluo,{placeholder:'Ej: 151-95'})}
      ${field('Sistema de riego a proyectar','pr-sistema',p.sistemaRiego,{type:'select',options:SISTEMA_OPCIONES,placeholder:true})}
      ${field('Sup. Total Predio [ha]','pr-suptot',p.supTotalHa,{type:'number',step:'.01'})}
      ${field('Sup. a Regar [ha]','pr-supregar',p.supRegarHa,{type:'number',step:'.01'})}
    </div>
    <hr class="sep">
    <div class="sl">Coordenadas del proyecto</div>
    <div class="fg">
      ${field('UTM Norte [m]','pr-utmn',p.coordNorte,{type:'number'})}
      ${field('UTM Este [m]','pr-utme',p.coordEste,{type:'number'})}
      ${field('Huso','pr-huso',p.huso)}
    </div>
    <button class="btn sm" onclick="capturarGPS('pr')">📍 Capturar coordenadas GPS</button>
    <p class="hint">Requiere GPS del dispositivo. Si no hay señal, ingresa manualmente desde otro instrumento.</p>
    `;
  },
  fuente(){
    const f=F.fuente;
    return `<div class="sl">Fuente de agua para el riego</div>
    <div class="fg">
      ${field('Tipo fuente de agua','fu-tipo',f.tipo,{type:'select',options:FUENTES_DEFAULT,placeholder:true,full:true})}
      ${field('Coord. captación — Norte','fu-utmn',f.coordNorte,{type:'number'})}
      ${field('Coord. captación — Este','fu-utme',f.coordEste,{type:'number'})}
      ${field('Huso','fu-huso',f.huso)}
      ${field('Características de la fuente','fu-caract',f.caracteristicas,{full:true,placeholder:'Ej: diámetro, profundidad'})}
      ${field('Observaciones fuente de agua','fu-obs',f.observaciones,{type:'textarea',full:true})}
    </div>
    <hr class="sep">
    <div class="sl">Datos para Diseñador <span class="badge">para Diseñador</span></div>
    <div class="fg">
      ${field('Caudal Disponible [l/s]','fu-caudal',f.caudalLs,{type:'number',step:'.01',placeholder:'3.00'})}
      ${field('Horas de Riego Disp. [hr/día]','fu-horas',f.horasRiegoDia,{type:'number',placeholder:'14'})}
    </div>
    <button class="btn sm" onclick="capturarGPS('fu')">📍 Capturar coordenadas de captación</button>
    `;
  },
  tenencia(){
    const t=F.tenencia;
    return `<div class="sl">Derechos de agua y tenencia de la tierra</div>
    <div class="fg">
      ${field('Tipo tenencia de la tierra','te-tierra',t.tipoTierra,{type:'select',options:['Propietario/a','Arrendatario/a','Usufructuario/a','Comodatario/a','Sucesión / Herencia','Otro'],placeholder:true})}
      ${field('¿Vio documentos de tierra?','te-doctierra',t.docTierra,{type:'radio'})}
      ${field('Tipo de derecho de agua (ITT-01)','te-derecho',t.tipoDerecho,{type:'select',options:DERECHO_OPCIONES,placeholder:true,full:true})}
      ${field('¿Vio documentos de agua?','te-docagua',t.docAgua,{type:'radio'})}
    </div>`;
  },
  corrob(){
    const a=F.corrobActual, p=F.corrobProyecto;
    const metodoOpts=['Sin riego','Tendido/Surcos','Manguera','Aspersión','Microaspersión','Goteo','Carrete','Otro'];
    const cultOpts = CULTIVOS_DEFAULT.concat(['Otro']);
    return `<div class="sl">Corroboración de caudal — Situación ACTUAL</div>
    <div class="fg">
      ${field('Cultivo de riego','ca-cult',a.cultivo,{type:'select',options:cultOpts,placeholder:true})}
      ${a.cultivo==='Otro'?field('Especifique cultivo','ca-cultotro',a.cultivoOtro):''}
      ${field('Superficie regada [m²]','ca-sup',a.superficieM2,{type:'number'})}
      ${field('Método de riego','ca-met',a.metodo,{type:'select',options:metodoOpts,placeholder:true})}
      ${field('Meses en que riega','ca-meses',a.meses,{placeholder:'Ej: Todo el año'})}
      ${field('Obras de riego existentes','ca-obras',a.obras,{full:true})}
    </div>
    <hr class="sep">
    <div class="sl">Corroboración de caudal — Situación CON PROYECTO</div>
    <div class="fg">
      ${field('Cultivo de riego','cp-cult',p.cultivo,{type:'select',options:cultOpts,placeholder:true})}
      ${p.cultivo==='Otro'?field('Especifique cultivo','cp-cultotro',p.cultivoOtro):''}
      ${field('Superficie a regar [m²]','cp-sup',p.superficieM2,{type:'number'})}
      ${field('Método de riego proyectado','cp-met',p.metodo,{type:'select',options:metodoOpts,placeholder:true})}
      ${field('Meses en que regará','cp-meses',p.meses,{placeholder:'Ej: Todo el año'})}
      ${field('Obras de riego proyectadas','cp-obras',p.obras,{full:true})}
    </div>
    <p class="hint">El cultivo y superficie de la situación con proyecto se usan para precargar Diseñador de Riego.</p>`;
  },
  energia(){
    const e=F.energia;
    return `<div class="sl">Energización</div>
    <div class="fg">
      ${field('Tipo de energía disponible','en-disp',e.tipoDisponible,{type:'select',options:['Eléctrica (red)','Diesel/Bencina','No dispone'],placeholder:true})}
      ${field('Tipo de energía proyectada','en-proy',e.tipoProyectada,{type:'select',options:['Eléctrica (red)','Fotovoltaica','Diesel/Bencina','Mixta'],placeholder:true})}
      ${field('Observaciones','en-obs',e.observaciones,{full:true})}
    </div>`;
  },
  otros(){
    const o=F.otros;
    return `<div class="sl">Otros datos</div>
    <div class="fg">
      ${field('¿Con inicio de actividades?','ot-inicio',o.inicioActividades,{type:'radio'})}
      ${field('¿Proyecto incluye IVA?','ot-iva',o.incluyeIVA,{type:'radio'})}
      ${field('¿Participa en programa INDAP?','ot-indap',o.participaINDAP,{type:'radio'})}
      ${field('Descripción','ot-desc',o.descripcion,{full:true})}
    </div>`;
  },
  encuestador(){
    const e=F.encuestador;
    return `<div class="sl">Datos encuestador</div>
    <div class="fg">
      ${field('Nombre encuestador','en2-nombre',e.nombre,{full:true})}
      ${field('Cargo','en2-cargo',e.cargo)}
      ${field('Datos de contacto','en2-contacto',e.datosContacto)}
      ${field('¿Con consultor?','en2-conconsultor',e.conConsultor,{type:'radio'})}
      ${field('Nombre consultor','en2-nomconsultor',e.nombreConsultor,{full:true})}
    </div>`;
  },
  firmas(){
    return `<div class="sl">Firma del encuestador / consultor</div>
    <div class="sig-box"><canvas id="sigCanvas1"></canvas></div>
    <button class="btn sm" onclick="limpiarFirma(1)">Limpiar</button>
    <hr class="sep">
    <div class="sl">Firma del beneficiario / agricultor(a)</div>
    <div class="sig-box"><canvas id="sigCanvas2"></canvas></div>
    <button class="btn sm" onclick="limpiarFirma(2)">Limpiar</button>`;
  },
  croquis(){
    return `<div class="sl">Dibujo esquemático</div>
    <p class="hint">Límites prediales, emplazamiento de obra, accesos, fuente de agua, energía, obras existentes, topografía, caminos/canales que crucen el predio.</p>
    <div class="sig-box" style="border-style:solid"><canvas id="croquisCanvas"></canvas></div>
    <button class="btn sm" onclick="limpiarCroquis()">Limpiar</button>`;
  },
  fotos(){
    const thumbs = F.fotos.map((p,i)=>`<div class="thumb"><img src="${p.dataUrl}"><button class="rm" onclick="quitarFoto(${i})">✕</button></div>`).join('');
    return `<div class="sl">Fotos referenciales</div>
    <input type="file" accept="image/*" capture="environment" id="fotoInput" style="display:none" onchange="agregarFoto(event)">
    <button class="btn pri" onclick="document.getElementById('fotoInput').click()">📷 Tomar foto</button>
    <div class="thumbs">${thumbs}</div>`;
  },
  anexos(){
    const items = F.anexos.map((a,i)=>`
      <div class="anexo-item">
        <img src="${a.dataUrl}">
        <div class="info"><input value="${esc(a.etiqueta)}" onchange="renombrarAnexo(${i},this.value)" placeholder="Nombre del documento (RUT, escritura, etc.)"></div>
        <button class="btn sm warn" onclick="quitarAnexo(${i})">✕</button>
      </div>`).join('');
    return `<div class="sl">Anexos documentales</div>
    <p class="hint">Escanea RUT, escritura, DAA u otro documento. Se recorta y endereza automáticamente.</p>
    <input type="file" accept="image/*" capture="environment" id="anexoInput" style="display:none" onchange="iniciarEscaneo(event)">
    <button class="btn pri" onclick="document.getElementById('anexoInput').click()">📄 Escanear documento</button>
    ${items}`;
  },
  exportar(){
    return `<div class="sl">Guardar / Exportar</div>
    <button class="btn pri full" style="width:100%;margin-bottom:8px" onclick="guardarFicha().then(()=>toast('Guardado'))">💾 Guardar ficha</button>
    <hr class="sep">
    <button class="btn" style="width:100%;margin-bottom:8px" onclick="exportarPDF()">📄 Generar ficha PDF</button>
    <button class="btn" style="width:100%;margin-bottom:8px" onclick="exportarJSONCompleto()">⬇ Exportar ficha completa (.json)</button>
    <button class="btn" style="width:100%;margin-bottom:8px" onclick="exportarJSONDisenador()">⬇ Exportar para Diseñador de Riego (.json)</button>
    <p class="hint">El export "para Diseñador" solo incluye los campos de identificación/sitio — no reemplaza el diseño hidráulico.</p>`;
  }
};

// ---------- Guardar valores del paso actual al modelo F ----------
function guardarPasoActual(){
  const s = STEPS[curStep].id;
  if(s==='contacto'){
    const c=F.contacto;
    c.nombre=val('ct-nombre'); c.rut=val('ct-rut'); c.telefono=val('ct-tel'); c.email=val('ct-mail');
    c.nGrupoFamiliar=val('ct-ngf'); c.region=val('ct-region'); c.comuna=val('ct-comuna'); c.sector=val('ct-sector');
    c.genero=val('ct-genero'); c.puebloOriginario=radioVal('ct-pueblo'); c.puebloCual=val('ct-pueblocual');
    c.aporteDinero=val('ct-apdinero'); c.aporteBienes=val('ct-apbienes'); c.aporteManoObra=val('ct-apmano');
    c.agricultorInteresado=radioVal('ct-interes');
  } else if(s==='proyecto'){
    const p=F.proyecto;
    p.nombreProyecto=val('pr-nombre'); p.consultor=val('pr-consultor'); p.rolAvaluo=val('pr-rol');
    p.sistemaRiego=val('pr-sistema'); p.supTotalHa=val('pr-suptot'); p.supRegarHa=val('pr-supregar');
    p.coordNorte=val('pr-utmn'); p.coordEste=val('pr-utme'); p.huso=val('pr-huso');
  } else if(s==='fuente'){
    const f=F.fuente;
    f.tipo=val('fu-tipo'); f.coordNorte=val('fu-utmn'); f.coordEste=val('fu-utme'); f.huso=val('fu-huso');
    f.caracteristicas=val('fu-caract'); f.observaciones=val('fu-obs'); f.caudalLs=val('fu-caudal'); f.horasRiegoDia=val('fu-horas');
  } else if(s==='tenencia'){
    const t=F.tenencia;
    t.tipoTierra=val('te-tierra'); t.docTierra=radioVal('te-doctierra'); t.tipoDerecho=val('te-derecho'); t.docAgua=radioVal('te-docagua');
  } else if(s==='corrob'){
    const a=F.corrobActual, p=F.corrobProyecto;
    a.cultivo=val('ca-cult'); a.cultivoOtro=val('ca-cultotro'); a.superficieM2=val('ca-sup'); a.metodo=val('ca-met'); a.meses=val('ca-meses'); a.obras=val('ca-obras');
    p.cultivo=val('cp-cult'); p.cultivoOtro=val('cp-cultotro'); p.superficieM2=val('cp-sup'); p.metodo=val('cp-met'); p.meses=val('cp-meses'); p.obras=val('cp-obras');
  } else if(s==='energia'){
    const e=F.energia; e.tipoDisponible=val('en-disp'); e.tipoProyectada=val('en-proy'); e.observaciones=val('en-obs');
  } else if(s==='otros'){
    const o=F.otros; o.inicioActividades=radioVal('ot-inicio'); o.incluyeIVA=radioVal('ot-iva'); o.participaINDAP=radioVal('ot-indap'); o.descripcion=val('ot-desc');
  } else if(s==='encuestador'){
    const e=F.encuestador; e.nombre=val('en2-nombre'); e.cargo=val('en2-cargo'); e.datosContacto=val('en2-contacto');
    e.conConsultor=radioVal('en2-conconsultor'); e.nombreConsultor=val('en2-nomconsultor');
  }
}

// ---------- GPS ----------
function capturarGPS(prefix){
  if(!navigator.geolocation){ toast('GPS no disponible'); return; }
  toast('Obteniendo ubicación…');
  navigator.geolocation.getCurrentPosition(pos=>{
    const {latitude, longitude} = pos.coords;
    const utm = toUTM(latitude, longitude);
    document.getElementById(prefix+'-utmn').value = utm.n;
    document.getElementById(prefix+'-utme').value = utm.e;
    document.getElementById(prefix+'-huso').value = utm.zone;
    toast('Coordenadas capturadas');
  }, err=>{ toast('No se pudo obtener GPS: '+err.message); }, {enableHighAccuracy:true, timeout:15000});
}
// Conversión lat/lon (WGS84) -> UTM, sin librerías externas
function toUTM(lat, lon){
  const a=6378137.0, e=0.081819191;
  const k0=0.9996;
  const zone = Math.floor((lon+180)/6)+1;
  const lonOrigin = (zone-1)*6-180+3;
  const latR = lat*Math.PI/180, lonR = lon*Math.PI/180, lonOrigR = lonOrigin*Math.PI/180;
  const eSq = e*e, ePrimeSq = eSq/(1-eSq);
  const N = a/Math.sqrt(1-eSq*Math.sin(latR)*Math.sin(latR));
  const T = Math.tan(latR)*Math.tan(latR);
  const C = ePrimeSq*Math.cos(latR)*Math.cos(latR);
  const A = Math.cos(latR)*(lonR-lonOrigR);
  const M = a*((1-eSq/4-3*eSq*eSq/64-5*eSq*eSq*eSq/256)*latR
    -(3*eSq/8+3*eSq*eSq/32+45*eSq*eSq*eSq/1024)*Math.sin(2*latR)
    +(15*eSq*eSq/256+45*eSq*eSq*eSq/1024)*Math.sin(4*latR)
    -(35*eSq*eSq*eSq/3072)*Math.sin(6*latR));
  let easting = k0*N*(A+(1-T+C)*A*A*A/6+(5-18*T+T*T+72*C-58*ePrimeSq)*A*A*A*A*A/120)+500000;
  let northing = k0*(M+N*Math.tan(latR)*(A*A/2+(5-T+9*C+4*C*C)*A*A*A*A/24+(61-58*T+T*T+600*C-330*ePrimeSq)*A*A*A*A*A*A/720));
  if(lat<0) northing += 10000000;
  return { n: Math.round(northing), e: Math.round(easting), zone };
}

// ---------- Firmas / Croquis (canvas táctil) ----------
function setupCanvasPad(canvasId, initialDataUrl, onEnd){
  const c = document.getElementById(canvasId);
  const dpr = window.devicePixelRatio||1;
  const rect = c.getBoundingClientRect();
  c.width = rect.width*dpr; c.height = 160*dpr;
  const ctx = c.getContext('2d');
  ctx.scale(dpr,dpr); ctx.lineWidth=2.2; ctx.lineCap='round'; ctx.strokeStyle='#0b2545';
  if(initialDataUrl){ const img=new Image(); img.onload=()=>ctx.drawImage(img,0,0,rect.width,160); img.src=initialDataUrl; }
  let drawing=false, last=null;
  function pos(e){ const r=c.getBoundingClientRect(); const p=e.touches?e.touches[0]:e; return {x:p.clientX-r.left,y:p.clientY-r.top}; }
  function start(e){ drawing=true; last=pos(e); e.preventDefault(); }
  function move(e){ if(!drawing) return; const p=pos(e); ctx.beginPath(); ctx.moveTo(last.x,last.y); ctx.lineTo(p.x,p.y); ctx.stroke(); last=p; e.preventDefault(); }
  function end(){ if(drawing && onEnd) onEnd(c.toDataURL('image/png')); drawing=false; }
  c.addEventListener('mousedown',start); c.addEventListener('mousemove',move); window.addEventListener('mouseup',end);
  c.addEventListener('touchstart',start,{passive:false}); c.addEventListener('touchmove',move,{passive:false}); c.addEventListener('touchend',end);
  c._ctx=ctx; c._rect=rect;
  return c;
}
function initFirmas(){
  setupCanvasPad('sigCanvas1', F.firmaEncuestador, d=>F.firmaEncuestador=d);
  setupCanvasPad('sigCanvas2', F.firmaBeneficiario, d=>F.firmaBeneficiario=d);
}
function limpiarFirma(n){
  const id = n===1?'sigCanvas1':'sigCanvas2';
  const c=document.getElementById(id); const ctx=c._ctx; ctx.clearRect(0,0,c.width,c.height);
  if(n===1) F.firmaEncuestador=''; else F.firmaBeneficiario='';
}
function initCroquis(){ setupCanvasPad('croquisCanvas', F.dibujoEsquematico, d=>F.dibujoEsquematico=d); document.getElementById('croquisCanvas').style.height='260px'; }
function limpiarCroquis(){ const c=document.getElementById('croquisCanvas'); const ctx=c._ctx; ctx.clearRect(0,0,c.width,c.height); F.dibujoEsquematico=''; }

// ---------- Fotos referenciales ----------
function fileToDataUrl(file, maxDim=1600, quality=0.82){
  return new Promise((res)=>{
    const img = new Image();
    const reader = new FileReader();
    reader.onload = e=>{ img.onload=()=>{
      let w=img.width, h=img.height;
      if(w>h && w>maxDim){ h=h*maxDim/w; w=maxDim; } else if(h>maxDim){ w=w*maxDim/h; h=maxDim; }
      const cv=document.createElement('canvas'); cv.width=w; cv.height=h;
      cv.getContext('2d').drawImage(img,0,0,w,h);
      res(cv.toDataURL('image/jpeg', quality));
    }; img.src=e.target.result; };
    reader.readAsDataURL(file);
  });
}
async function agregarFoto(ev){
  const file = ev.target.files[0]; if(!file) return;
  const dataUrl = await fileToDataUrl(file, 1600, 0.82);
  F.fotos.push({id:uuid(), dataUrl});
  ev.target.value='';
  renderStep();
}
function quitarFoto(i){ F.fotos.splice(i,1); renderStep(); }

// ---------- Anexos: escaneo con recorte/enderezado (homografía) ----------
let _cropImg=null, _cropPts=null, _cropCanvasEl=null;
function iniciarEscaneo(ev){
  const file = ev.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = e=>{
    const img = new Image();
    img.onload=()=>{ _cropImg=img; abrirModalCrop(img); };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
  ev.target.value='';
}
function abrirModalCrop(img){
  document.getElementById('cropModal').style.display='flex';
  const wrap = document.getElementById('cropWrap');
  const maxW = Math.min(window.innerWidth-60, 560);
  const scale = Math.min(maxW/img.width, 1);
  const w = img.width*scale, h = img.height*scale;
  const cv = document.getElementById('cropCanvas');
  cv.width=w; cv.height=h;
  const ctx = cv.getContext('2d');
  ctx.drawImage(img,0,0,w,h);
  _cropCanvasEl = cv;
  // puntos iniciales: margen del 6% respecto al borde (guía; el usuario ajusta)
  const m=0.06;
  _cropPts = [
    {x:w*m, y:h*m}, {x:w*(1-m), y:h*m}, {x:w*(1-m), y:h*(1-m)}, {x:w*m, y:h*(1-m)}
  ];
  drawHandles();
}
function drawHandles(){
  document.querySelectorAll('.handle').forEach(h=>h.remove());
  const wrap = document.getElementById('cropWrap');
  const cv = _cropCanvasEl;
  _cropPts.forEach((p,i)=>{
    const h = document.createElement('div'); h.className='handle';
    h.style.left = p.x+'px'; h.style.top = p.y+'px';
    let dragging=false;
    function move(e){ if(!dragging) return; const r=cv.getBoundingClientRect(); const pt=e.touches?e.touches[0]:e;
      p.x = Math.max(0,Math.min(cv.width, pt.clientX-r.left)); p.y = Math.max(0,Math.min(cv.height, pt.clientY-r.top));
      h.style.left=p.x+'px'; h.style.top=p.y+'px'; redrawCropOutline(); e.preventDefault(); }
    h.addEventListener('mousedown',()=>dragging=true); window.addEventListener('mousemove',move); window.addEventListener('mouseup',()=>dragging=false);
    h.addEventListener('touchstart',e=>{dragging=true;e.preventDefault();},{passive:false});
    h.addEventListener('touchmove',move,{passive:false}); h.addEventListener('touchend',()=>dragging=false);
    wrap.appendChild(h);
  });
  redrawCropOutline();
}
function redrawCropOutline(){
  const cv=_cropCanvasEl, ctx=cv.getContext('2d');
  ctx.drawImage(_cropImg,0,0,cv.width,cv.height);
  ctx.strokeStyle='#2f7dc4'; ctx.lineWidth=2; ctx.beginPath();
  _cropPts.forEach((p,i)=> i===0? ctx.moveTo(p.x,p.y): ctx.lineTo(p.x,p.y));
  ctx.closePath(); ctx.stroke();
}
function cancelCrop(){ document.getElementById('cropModal').style.display='none'; }

// Homografía: resuelve la matriz 3x3 que mapea src(4 pts) -> dst(4 pts)
function computeHomography(src, dst){
  const A=[];
  for(let i=0;i<4;i++){
    const {x:sx,y:sy}=src[i], {x:dx,y:dy}=dst[i];
    A.push([sx,sy,1,0,0,0,-dx*sx,-dx*sy]); A.push([0,0,0,sx,sy,1,-dy*sx,-dy*sy]);
  }
  const b = []; dst.forEach(p=>{ b.push(p.x); b.push(p.y); });
  const h = solveLinear(A,b); // 8 incógnitas
  return [h[0],h[1],h[2], h[3],h[4],h[5], h[6],h[7],1];
}
function solveLinear(A,b){
  const n=A.length;
  const M = A.map((row,i)=>row.concat([b[i]]));
  for(let i=0;i<n;i++){
    let maxRow=i; for(let k=i+1;k<n;k++) if(Math.abs(M[k][i])>Math.abs(M[maxRow][i])) maxRow=k;
    [M[i],M[maxRow]]=[M[maxRow],M[i]];
    for(let k=i+1;k<n;k++){ const f=M[k][i]/M[i][i]; for(let j=i;j<=n;j++) M[k][j]-=f*M[i][j]; }
  }
  const x=new Array(n).fill(0);
  for(let i=n-1;i>=0;i--){ let s=M[i][n]; for(let j=i+1;j<n;j++) s-=M[i][j]*x[j]; x[i]=s/M[i][i]; }
  return x;
}
function applyCrop(){
  // dimensiones de salida en base a distancias promedio (aspecto tipo hoja)
  const p = _cropPts;
  const wTop=dist(p[0],p[1]), wBot=dist(p[3],p[2]), hL=dist(p[0],p[3]), hR=dist(p[1],p[2]);
  const outW = Math.round(Math.max(wTop,wBot)); const outH = Math.round(Math.max(hL,hR));
  const scaleX = _cropImg.width / _cropCanvasEl.width, scaleY = _cropImg.height / _cropCanvasEl.height;
  const srcPts = p.map(pt=>({x:pt.x*scaleX, y:pt.y*scaleY}));
  const dstPts = [{x:0,y:0},{x:outW,y:0},{x:outW,y:outH},{x:0,y:outH}];
  const H = computeHomography(dstPts, srcPts); // dst->src (para muestreo inverso)

  const srcCanvas = document.createElement('canvas'); srcCanvas.width=_cropImg.width; srcCanvas.height=_cropImg.height;
  srcCanvas.getContext('2d').drawImage(_cropImg,0,0);
  const srcData = srcCanvas.getContext('2d').getImageData(0,0,srcCanvas.width,srcCanvas.height).data;
  const sw=srcCanvas.width, sh=srcCanvas.height;

  const outCanvas = document.createElement('canvas'); outCanvas.width=outW; outCanvas.height=outH;
  const outCtx = outCanvas.getContext('2d');
  const outImgData = outCtx.createImageData(outW,outH);
  for(let y=0;y<outH;y++){
    for(let x=0;x<outW;x++){
      const denom = H[6]*x+H[7]*y+H[8];
      const sx = (H[0]*x+H[1]*y+H[2])/denom;
      const sy = (H[3]*x+H[4]*y+H[5])/denom;
      const idxOut = (y*outW+x)*4;
      if(sx>=0 && sx<sw-1 && sy>=0 && sy<sh-1){
        const x0=Math.floor(sx), y0=Math.floor(sy), fx=sx-x0, fy=sy-y0;
        for(let c=0;c<3;c++){
          const p00=srcData[(y0*sw+x0)*4+c], p10=srcData[(y0*sw+x0+1)*4+c];
          const p01=srcData[((y0+1)*sw+x0)*4+c], p11=srcData[((y0+1)*sw+x0+1)*4+c];
          const top=p00+(p10-p00)*fx, bot=p01+(p11-p01)*fx;
          outImgData.data[idxOut+c] = top+(bot-top)*fy;
        }
        outImgData.data[idxOut+3]=255;
      } else { outImgData.data[idxOut]=255; outImgData.data[idxOut+1]=255; outImgData.data[idxOut+2]=255; outImgData.data[idxOut+3]=255; }
    }
  }
  outCtx.putImageData(outImgData,0,0);
  const dataUrl = outCanvas.toDataURL('image/jpeg', 0.86);
  F.anexos.push({id:uuid(), etiqueta:'', dataUrl});
  document.getElementById('cropModal').style.display='none';
  renderStep();
}
function dist(a,b){ return Math.hypot(a.x-b.x,a.y-b.y); }
function renombrarAnexo(i,v){ F.anexos[i].etiqueta=v; }
function quitarAnexo(i){ F.anexos.splice(i,1); renderStep(); }

// ---------- Exportar JSON completo ----------
function nombreArchivoBase(){
  const n = (F.contacto.nombre||'ficha').trim().replace(/\s+/g,'_').replace(/[^\w-]/g,'');
  return (n||'ficha')+'_'+F.fecha;
}
function descargarArchivo(nombre, contenido, mime){
  const blob = new Blob([contenido], {type:mime});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download=nombre; document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 1500);
}
function exportarJSONCompleto(){
  guardarPasoActual();
  descargarArchivo(nombreArchivoBase()+'.json', JSON.stringify(F,null,2), 'application/json');
  toast('Ficha completa exportada');
}

// ---------- Exportar JSON compatible con Diseñador de Riego ----------
function exportarJSONDisenador(){
  guardarPasoActual();
  const sys = F.proyecto.sistemaRiego;
  if(!sys){ toast('Selecciona el sistema de riego en el paso "Proyecto"'); return; }
  const pfx = PFX[sys];
  const fields = {};
  const p=F.proyecto, c=F.contacto, fu=F.fuente, te=F.tenencia, cp=F.corrobProyecto;
  fields[pfx+'-consultor'] = p.consultor||'';
  fields[pfx+'-nombre-proy'] = p.nombreProyecto||'';
  fields[pfx+'-prop'] = c.nombre||'';
  fields[pfx+'-rol'] = p.rolAvaluo||'';
  fields[pfx+'-sec'] = c.sector||'';
  fields[pfx+'-com'] = c.comuna||'';
  fields[pfx+'-huso'] = p.huso||'';
  fields[pfx+'-utmn'] = p.coordNorte||'';
  fields[pfx+'-utme'] = p.coordEste||'';
  const supRegarId = DR_SUP_REGAR[sys]; if(supRegarId) fields[supRegarId] = p.supRegarHa||'';
  if(sys==='asp' && p.supTotalHa) fields['a-sttot'] = p.supTotalHa;
  const cultivoFinal = cp.cultivo==='Otro'? cp.cultivoOtro : cp.cultivo;
  fields[pfx+'-cult'] = cultivoFinal||'';
  fields[pfx+'-tfue'] = fu.tipo||'';
  fields[pfx+'-der-tipo'] = te.tipoDerecho||'';
  fields[pfx+'-q'] = fu.caudalLs||'';
  fields[pfx+'-hrs'] = fu.horasRiegoDia||'';

  const out = { __sys: sys, __name: (p.nombreProyecto||c.nombre||'Proyecto'), __date: new Date().toLocaleString('es-CL'), fields,
    __origen: 'ficha-terreno', __nota: 'Solo campos de identificación/sitio. Verificar catálogo de Cultivo/Fuente en Diseñador si no coinciden.' };
  descargarArchivo(nombreArchivoBase()+'_paraDisenador.json', JSON.stringify(out,null,2), 'application/json');
  toast('JSON para Diseñador exportado');
}

// ---------- PDF (impresión) ----------
function exportarPDF(){
  guardarPasoActual();
  const F_ = F;
  const c=F_.contacto, p=F_.proyecto, fu=F_.fuente, te=F_.tenencia, ca=F_.corrobActual, cp=F_.corrobProyecto, en=F_.energia, ot=F_.otros, es=F_.encuestador;
  const cult = v=> v && v.cultivo==='Otro'? v.cultivoOtro : (v?v.cultivo:'');
  const row = (l,v)=> `<div style="display:flex;border:1px solid #999;"><div style="width:42%;padding:4px 6px;font-weight:600;background:#f0f0f0;border-right:1px solid #999">${l}</div><div style="flex:1;padding:4px 6px">${esc(v)}</div></div>`;
  const html = `
  <div style="font-family:Arial,sans-serif;font-size:11px;color:#111;max-width:760px;margin:auto">
    <h2 style="text-align:center;margin:6px 0">FICHA VISITA TERRENO<br><span style="font-size:12px;font-weight:400">Para levantamiento de demanda</span></h2>
    <p style="text-align:right">Fecha: ${esc(F_.fecha)}</p>
    <div style="font-weight:700;background:#dceaf7;padding:4px 6px;margin-top:8px">Información de contacto</div>
    ${row('Nombre',c.nombre)} ${row('RUT',c.rut)} ${row('Teléfono',c.telefono)} ${row('E-mail',c.email)}
    ${row('N° Grupo Familiar',c.nGrupoFamiliar)} ${row('Región/Comuna/Sector', [c.region,c.comuna,c.sector].filter(Boolean).join(' / '))}
    ${row('Género',c.genero)} ${row('Pueblo originario',(c.puebloOriginario==='Si'?'Sí — '+c.puebloCual:'No'))}
    ${row('Aporte postulante',[c.aporteDinero&&'Dinero',c.aporteBienes&&'Bienes',c.aporteManoObra&&'Mano de obra'].filter(Boolean).join(', '))}
    ${row('Interesado en participar',c.agricultorInteresado)}

    <div style="font-weight:700;background:#dceaf7;padding:4px 6px;margin-top:8px">Proyecto</div>
    ${row('Nombre del proyecto',p.nombreProyecto)} ${row('Consultor',p.consultor)} ${row('ROL de avalúo',p.rolAvaluo)}
    ${row('Sistema de riego',p.sistemaRiego)} ${row('Sup. Total / Sup. a Regar [ha]', (p.supTotalHa||'-')+' / '+(p.supRegarHa||'-'))}
    ${row('Coordenadas proyecto', 'Norte '+p.coordNorte+' · Este '+p.coordEste+' · Huso '+p.huso)}

    <div style="font-weight:700;background:#dceaf7;padding:4px 6px;margin-top:8px">1. Fuente de agua</div>
    ${row('Tipo fuente',fu.tipo)} ${row('Coord. captación','Norte '+fu.coordNorte+' · Este '+fu.coordEste+' · Huso '+fu.huso)}
    ${row('Características',fu.caracteristicas)} ${row('Observaciones',fu.observaciones)}
    ${row('Caudal disponible [l/s]',fu.caudalLs)} ${row('Horas riego disp. [hr/día]',fu.horasRiegoDia)}

    <div style="font-weight:700;background:#dceaf7;padding:4px 6px;margin-top:8px">2. Derechos de agua y tenencia</div>
    ${row('Tipo tenencia tierra',te.tipoTierra)} ${row('Documentos vista tierra',te.docTierra)}
    ${row('Tipo derecho agua',te.tipoDerecho)} ${row('Documentos vista agua',te.docAgua)}

    <div style="font-weight:700;background:#dceaf7;padding:4px 6px;margin-top:8px">3. Corroboración de caudal</div>
    <table style="width:100%;border-collapse:collapse;margin-top:4px">
      <tr><td></td><td style="font-weight:700;border:1px solid #999;padding:4px">Situación actual</td><td style="font-weight:700;border:1px solid #999;padding:4px">Situación con proyecto</td></tr>
      <tr><td style="font-weight:600;border:1px solid #999;padding:4px">Cultivo</td><td style="border:1px solid #999;padding:4px">${esc(cult(ca))}</td><td style="border:1px solid #999;padding:4px">${esc(cult(cp))}</td></tr>
      <tr><td style="font-weight:600;border:1px solid #999;padding:4px">Superficie [m²]</td><td style="border:1px solid #999;padding:4px">${esc(ca.superficieM2)}</td><td style="border:1px solid #999;padding:4px">${esc(cp.superficieM2)}</td></tr>
      <tr><td style="font-weight:600;border:1px solid #999;padding:4px">Método</td><td style="border:1px solid #999;padding:4px">${esc(ca.metodo)}</td><td style="border:1px solid #999;padding:4px">${esc(cp.metodo)}</td></tr>
      <tr><td style="font-weight:600;border:1px solid #999;padding:4px">Meses</td><td style="border:1px solid #999;padding:4px">${esc(ca.meses)}</td><td style="border:1px solid #999;padding:4px">${esc(cp.meses)}</td></tr>
      <tr><td style="font-weight:600;border:1px solid #999;padding:4px">Obras</td><td style="border:1px solid #999;padding:4px">${esc(ca.obras)}</td><td style="border:1px solid #999;padding:4px">${esc(cp.obras)}</td></tr>
    </table>

    <div style="font-weight:700;background:#dceaf7;padding:4px 6px;margin-top:8px">4. Energización</div>
    ${row('Disponible',en.tipoDisponible)} ${row('Proyectada',en.tipoProyectada)} ${row('Observaciones',en.observaciones)}

    <div style="font-weight:700;background:#dceaf7;padding:4px 6px;margin-top:8px">5. Otros datos</div>
    ${row('Con inicio de actividades',ot.inicioActividades)} ${row('Proyecto incluye IVA',ot.incluyeIVA)} ${row('Participa INDAP',ot.participaINDAP)} ${row('Descripción',ot.descripcion)}

    <div style="font-weight:700;background:#dceaf7;padding:4px 6px;margin-top:8px">6. Datos encuestador</div>
    ${row('Nombre',es.nombre)} ${row('Cargo',es.cargo)} ${row('Contacto',es.datosContacto)} ${row('Con consultor',es.conConsultor+(es.nombreConsultor?' — '+es.nombreConsultor:''))}

    <div style="display:flex;gap:20px;margin-top:20px;page-break-inside:avoid">
      <div style="flex:1;text-align:center">
        ${F_.firmaEncuestador?`<img src="${F_.firmaEncuestador}" style="height:60px">`:''}
        <div style="border-top:1px solid #333;margin-top:4px;padding-top:2px">Firma encuestador / consultor</div>
      </div>
      <div style="flex:1;text-align:center">
        ${F_.firmaBeneficiario?`<img src="${F_.firmaBeneficiario}" style="height:60px">`:''}
        <div style="border-top:1px solid #333;margin-top:4px;padding-top:2px">Firma beneficiario/a</div>
      </div>
    </div>

    ${F_.dibujoEsquematico?`<div style="page-break-before:always"><div style="font-weight:700;background:#dceaf7;padding:4px 6px;margin-top:8px">7. Dibujo esquemático</div><img src="${F_.dibujoEsquematico}" style="width:100%;border:1px solid #999;margin-top:6px"></div>`:''}

    ${F_.fotos.length?`<div style="page-break-before:always"><div style="font-weight:700;background:#dceaf7;padding:4px 6px;margin-top:8px">8. Fotos referenciales</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px">${F_.fotos.map(f=>`<img src="${f.dataUrl}" style="width:48%;border:1px solid #999">`).join('')}</div></div>`:''}

    ${F_.anexos.length?`<div style="page-break-before:always"><div style="font-weight:700;background:#dceaf7;padding:4px 6px;margin-top:8px">Anexos</div>
      ${F_.anexos.map(a=>`<div style="page-break-inside:avoid;margin-top:10px"><div style="font-weight:600">${esc(a.etiqueta||'Documento')}</div><img src="${a.dataUrl}" style="width:100%;border:1px solid #999;margin-top:4px"></div>`).join('')}</div>`:''}
  </div>`;
  const area = document.getElementById('printArea');
  area.innerHTML = html;
  const w = window.open('', '_blank');
  w.document.write('<html><head><title>Ficha</title><style>@page{size:letter}body{margin:16px}</style></head><body>'+html+'</body></html>');
  w.document.close();
  setTimeout(()=>w.print(), 400);
}

// ---------- Init ----------
(async function init(){
  await idbOpen();
  await goHome();
  if('serviceWorker' in navigator){ navigator.serviceWorker.register('sw.js').catch(()=>{}); }
})();
