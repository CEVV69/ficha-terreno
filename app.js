// ============================================================
// Ficha de Terreno v3 — Levantamiento de demanda (riego)
// ============================================================

const CULTIVOS_DEFAULT = ['Alfalfa','Pradera / Ballica','Maíz','Papa','Cebada','Trigo','Remolacha','Hortalizas','Frutales','Vides','Flores'];
const FUENTES_DEFAULT = ['Canal de riego','Río / Estero','Lago / Laguna','Pozo profundo','Pozo noria','Pozo zanja','Puntera (wellpoint)','Pozo sondaje (tubería de revestimiento)','Estanque acumulador','Tranque predial','Embalse','Vertiente intrapredial','Aguas lluvia (acumulación)'];
const DERECHO_OPCIONES = [
  {v:'permanente', l:'Permanente — inscrito CBR'},
  {v:'eventual', l:'Eventual — inscrito CBR'},
  {v:'no-inscrito-lluvia', l:'No inscrito — Art. 10 (Aguas lluvia)'},
  {v:'no-inscrito-vertiente', l:'No inscrito — Art. 20 (Vertiente/laguna)'},
  {v:'no-inscrito-art56', l:'No inscrito — Art. 56 (Consumo humano / PEPA)'}
];
const SISTEMA_MAP = {got:'Goteo', asp:'Aspersión', mic:'Microaspersión', car:'Carrete'};
const PFX = {got:'g', asp:'a', mic:'m', car:'c'};
const DR_SUP_REGAR = {asp:'a-strie', car:'c-supr', got:'g-sup', mic:'m-sup'};

// ---------- IndexedDB ----------
let DB;
function idbOpen(){
  return new Promise((res,rej)=>{
    const req=indexedDB.open('fichaTerrenoDB',2);
    req.onupgradeneeded=e=>{const db=e.target.result;if(!db.objectStoreNames.contains('fichas'))db.createObjectStore('fichas',{keyPath:'id'});};
    req.onsuccess=e=>{DB=e.target.result;res(DB);};
    req.onerror=e=>rej(e);
  });
}
function idbPut(f){return new Promise((res,rej)=>{const tx=DB.transaction('fichas','readwrite');tx.objectStore('fichas').put(f);tx.oncomplete=()=>res();tx.onerror=e=>rej(e);});}
function idbDelete(id){return new Promise((res,rej)=>{const tx=DB.transaction('fichas','readwrite');tx.objectStore('fichas').delete(id);tx.oncomplete=()=>res();tx.onerror=e=>rej(e);});}
function idbGetAll(){return new Promise((res,rej)=>{const tx=DB.transaction('fichas','readonly');const req=tx.objectStore('fichas').getAll();req.onsuccess=()=>res(req.result||[]);req.onerror=e=>rej(e);});}

// ---------- Estado ----------
let F=null, curStep=0;
function uuid(){return 'f'+Date.now().toString(36)+Math.random().toString(36).slice(2,8);}

function blankFicha(){
  return {
    id:uuid(), fecha:new Date().toISOString().slice(0,10), creado:Date.now(), modificado:Date.now(),
    contacto:{nombre:'',rut:'',telefono:'',region:'',comuna:'',sector:''},
    proyecto:{nombreProyecto:'',consultor:'',rolAvaluo:'',sistemas:[],supTotalHa:'',supRegarHa:'',coordNorte:'',coordEste:'',huso:'18'},
    fuente:{tipo:'',coordNorte:'',coordEste:'',huso:'18',caracteristicas:'',observaciones:'',caudalLs:'',horasRiegoDia:''},
    tenencia:{tipoTierra:'',docTierra:'Si',tipoDerecho:'',docAgua:'Si'},
    sra:{cultivo:'',cultivoOtro:'',superficieM2:'',metodo:'',meses:'',obras:''},
    srf:{cultivo:'',cultivoOtro:'',superficieM2:'',metodo:'',meses:'',obras:''},
    energia:{tipoDisponible:'',tipoProyectada:'',observaciones:''},
    otros:{inicioActividades:'No',incluyeIVA:'Si',usuarioIndap:'Si',descripcion:''},
    firmaEncuestador:'',firmaBeneficiario:'',dibujoEsquematico:'',
    fotos:[],anexos:[]
  };
}

// ---------- Toast ----------
function toast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('on');clearTimeout(toast._t);toast._t=setTimeout(()=>t.classList.remove('on'),2200);}

// ---------- Home ----------
async function goHome(){
  document.getElementById('home').style.display='block';
  document.getElementById('editor').style.display='none';
  document.getElementById('btnBack').style.display='none';
  document.getElementById('fabNew').style.display='block';
  document.getElementById('topTitle').textContent='Ficha de Terreno';
  await renderLista();
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
function nuevaFicha(){F=blankFicha();curStep=0;abrirEditor();}
async function abrirFicha(id){const fichas=await idbGetAll();F=fichas.find(f=>f.id===id);curStep=0;abrirEditor();}
function abrirEditor(){
  document.getElementById('home').style.display='none';
  document.getElementById('editor').style.display='block';
  document.getElementById('btnBack').style.display='inline-block';
  document.getElementById('fabNew').style.display='none';
  document.getElementById('topTitle').textContent=F.contacto.nombre||'Nueva ficha';
  renderPills();renderStep();
}

// ---------- Pasos ----------
const STEPS=[
  {id:'contacto',t:'Contacto'},
  {id:'proyecto',t:'Proyecto'},
  {id:'fuente',t:'Fuente agua'},
  {id:'tenencia',t:'Tenencia'},
  {id:'superficie',t:'Sup. riego'},
  {id:'energia_otros',t:'Energía / Otros'},
  {id:'firmas_croquis',t:'Firmas / Croquis'},
  {id:'fotos',t:'Fotos'},
  {id:'anexos',t:'Anexos'},
  {id:'exportar',t:'Exportar'}
];
function renderPills(){
  document.getElementById('pillNav').innerHTML=STEPS.map((s,i)=>
    `<button class="pill ${i===curStep?'on':''}" onclick="irPaso(${i})">${i+1}. ${s.t}</button>`).join('');
}
function irPaso(i){guardarPasoActual();curStep=i;renderPills();renderStep();}
function renderStep(){
  const s=STEPS[curStep];
  document.getElementById('stepsWrap').innerHTML=`<div class="card">${RENDERERS[s.id]()}</div>
    <div class="navbtns">
      <button class="btn" onclick="pasoAnterior()" ${curStep===0?'disabled':''}>‹ Anterior</button>
      <button class="btn pri" onclick="pasoSiguiente()">${curStep===STEPS.length-1?'Finalizar':'Siguiente ›'}</button>
    </div>`;
  if(s.id==='firmas_croquis')setTimeout(()=>{initFirmas();initCroquis();},0);
}
function pasoAnterior(){guardarPasoActual();if(curStep>0){curStep--;renderPills();renderStep();}}
async function pasoSiguiente(){guardarPasoActual();if(curStep<STEPS.length-1){curStep++;renderPills();renderStep();}else{await guardarFicha();toast('Ficha guardada');}}
async function guardarFicha(){F.modificado=Date.now();await idbPut(F);}

// ---------- Helpers de formulario ----------
function val(id){const e=document.getElementById(id);if(!e)return undefined;if(e.type==='checkbox')return e.checked;return e.value;}
function radioVal(id){const h=document.getElementById(id+'_hidden');return h?h.value:undefined;}
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');}

function field(label,id,value,opts={}){
  const type=opts.type||'text';
  if(type==='select'){
    const options=(opts.options||[]).map(o=>{const ov=typeof o==='string'?o:o.v;const ol=typeof o==='string'?o:o.l;return `<option value="${esc(ov)}"${ov===value?' selected':''}>${esc(ol)}</option>`;}).join('');
    return `<div class="f${opts.full?' full':''}"><label>${label}</label><select id="${id}"><option value="">—</option>${options}</select></div>`;
  }
  if(type==='textarea'){
    return `<div class="f${opts.full?' full':''}"><label>${label}</label><textarea id="${id}" placeholder="${esc(opts.placeholder||'')}">${esc(value||'')}</textarea></div>`;
  }
  if(type==='radio'){
    return `<div class="f${opts.full?' full':''}"><label>${label}</label><div class="chk-row">${(opts.options||['Si','No']).map(o=>`<label class="chk"><input type="radio" name="${id}" value="${o}"${value===o?' checked':''} onchange="document.getElementById('${id}_hidden').value=this.value"> ${o}</label>`).join('')}<input type="hidden" id="${id}_hidden" value="${esc(value||'')}"></div></div>`;
  }
  return `<div class="f${opts.full?' full':''}"><label>${label}</label><input type="${type}" id="${id}" value="${esc(value||'')}" placeholder="${esc(opts.placeholder||'')}"${opts.step?` step="${opts.step}"`:''} ${opts.style?`style="${opts.style}"`:''} ></div>`;
}

// Fila de coordenadas + botón GPS en la misma línea
function coordRow(prefix,norte,este,huso,btnPrefix){
  return `<div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin-bottom:10px">
    <div class="f" style="flex:3;min-width:110px"><label>UTM Norte [m]</label><input type="number" id="${prefix}-utmn" value="${esc(norte||'')}"></div>
    <div class="f" style="flex:3;min-width:110px"><label>UTM Este [m]</label><input type="number" id="${prefix}-utme" value="${esc(este||'')}"></div>
    <div class="f" style="flex:1;min-width:60px;max-width:80px"><label>Huso</label><input type="text" id="${prefix}-huso" value="${esc(huso||'18')}"></div>
    <button class="btn sm" style="margin-bottom:2px;white-space:nowrap" onclick="capturarGPS('${btnPrefix||prefix}')">📍 Captura coordenadas</button>
  </div>`;
}

// ---------- RENDERERS ----------
const RENDERERS={
  contacto(){
    const c=F.contacto;
    return `<div class="sl">Beneficiario</div>
    <div class="fg">
      ${field('Nombre completo','ct-nombre',c.nombre,{full:true})}
      ${field('RUT','ct-rut',c.rut)}
      ${field('Teléfono','ct-tel',c.telefono)}
      ${field('Región','ct-region',c.region)}
      ${field('Comuna','ct-comuna',c.comuna)}
      ${field('Sector / Localidad','ct-sector',c.sector)}
    </div>`;
  },

  proyecto(){
    const p=F.proyecto;
    const sys=p.sistemas||[];
    return `<div class="sl">Identificación del proyecto</div>
    <div class="fg">
      ${field('Nombre del proyecto','pr-nombre',p.nombreProyecto,{full:true,placeholder:'Ej: Habilitación pozo y riego por goteo'})}
      ${field('Consultor / Empresa','pr-consultor',p.consultor,{full:true})}
      ${field('ROL de Avalúo SII','pr-rol',p.rolAvaluo,{placeholder:'151-95'})}
      ${field('Sup. Total Predio [ha]','pr-suptot',p.supTotalHa,{type:'number',step:'.01'})}
      ${field('Sup. a Regar [ha]','pr-supregar',p.supRegarHa,{type:'number',step:'.01'})}
    </div>
    <div class="f full" style="margin-bottom:10px">
      <label>Sistema(s) de riego a proyectar</label>
      <div class="chk-row">
        ${Object.entries(SISTEMA_MAP).map(([v,l])=>`<label class="chk"><input type="checkbox" id="pr-sys-${v}"${sys.includes(v)?' checked':''}> ${l}</label>`).join('')}
      </div>
    </div>
    <hr class="sep">
    <div class="sl">Coordenadas del proyecto</div>
    ${coordRow('pr',p.coordNorte,p.coordEste,p.huso,'pr')}`;
  },

  fuente(){
    const f=F.fuente;
    return `<div class="sl">Fuente de agua</div>
    <div class="fg">
      ${field('Tipo fuente de agua','fu-tipo',f.tipo,{type:'select',options:FUENTES_DEFAULT,full:true})}
      ${field('Características','fu-caract',f.caracteristicas,{placeholder:'Ej: diámetro, profundidad'})}
      ${field('Observaciones','fu-obs',f.observaciones)}
      ${field('Caudal disponible [l/s]','fu-caudal',f.caudalLs,{type:'number',step:'.01',placeholder:'3.00'})}
      ${field('Horas de riego disp. [hr/día]','fu-horas',f.horasRiegoDia,{type:'number',placeholder:'14'})}
    </div>
    <hr class="sep">
    <div class="sl">Coordenadas punto de captación</div>
    ${coordRow('fu',f.coordNorte,f.coordEste,f.huso,'fu')}`;
  },

  tenencia(){
    const t=F.tenencia;
    return `<div class="sl">Tenencia de tierra y agua</div>
    <div class="fg">
      ${field('Tipo tenencia de la tierra','te-tierra',t.tipoTierra,{type:'select',options:['Propietario/a','Arrendatario/a','Usufructuario/a','Comodatario/a','Sucesión / Herencia','Otro']})}
      ${field('¿Documentos vista?','te-doctierra',t.docTierra,{type:'radio'})}
      ${field('Tipo de derecho de agua','te-derecho',t.tipoDerecho,{type:'select',options:DERECHO_OPCIONES})}
      ${field('¿Documentos vista?','te-docagua',t.docAgua,{type:'radio'})}
    </div>`;
  },

  superficie(){
    const a=F.sra, p=F.srf;
    const metodos=['Sin riego','Tendido / Surcos','Manguera','Aspersión','Microaspersión','Goteo','Carrete','Otro'];
    const cults=CULTIVOS_DEFAULT.concat(['Otro']);
    return `<div class="sl">Superficie de riego actual (SRA)</div>
    <div class="fg">
      ${field('Cultivo','sra-cult',a.cultivo,{type:'select',options:cults})}
      ${field('Cultivo (especifique)','sra-cultotro',a.cultivoOtro)}
      ${field('Superficie [m²]','sra-sup',a.superficieM2,{type:'number'})}
      ${field('Método de riego','sra-met',a.metodo,{type:'select',options:metodos})}
      ${field('Meses que riega','sra-meses',a.meses,{placeholder:'Todo el año'})}
      ${field('Obras existentes','sra-obras',a.obras,{full:true})}
    </div>
    <hr class="sep">
    <div class="sl">Superficie de riego futura (SRF)</div>
    <div class="fg">
      ${field('Cultivo','srf-cult',p.cultivo,{type:'select',options:cults})}
      ${field('Cultivo (especifique)','srf-cultotro',p.cultivoOtro)}
      ${field('Superficie [m²]','srf-sup',p.superficieM2,{type:'number'})}
      ${field('Método proyectado','srf-met',p.metodo,{type:'select',options:metodos})}
      ${field('Meses que regará','srf-meses',p.meses,{placeholder:'Todo el año'})}
      ${field('Obras a ejecutar','srf-obras',p.obras,{full:true})}
    </div>`;
  },

  energia_otros(){
    const e=F.energia, o=F.otros;
    return `<div class="sl">Fuente de energía</div>
    <div class="fg">
      ${field('Tipo disponible','en-disp',e.tipoDisponible,{type:'select',options:['Eléctrica (red)','Diesel / Bencina','No dispone']})}
      ${field('Tipo proyectada','en-proy',e.tipoProyectada,{type:'select',options:['Eléctrica (red)','Fotovoltaica','Diesel / Bencina','Mixta']})}
      ${field('Observaciones energía','en-obs',e.observaciones)}
    </div>
    <hr class="sep">
    <div class="sl">Otros antecedentes</div>
    <div class="fg">
      ${field('Con inicio de actividades','ot-inicio',o.inicioActividades,{type:'radio'})}
      ${field('Proyecto incluye IVA','ot-iva',o.incluyeIVA,{type:'radio'})}
      ${field('Usuario INDAP','ot-indap',o.usuarioIndap,{type:'radio'})}
      ${field('Descripción','ot-desc',o.descripcion,{full:true})}
    </div>`;
  },

  firmas_croquis(){
    return `<div class="sl">Firma encuestador / consultor</div>
    <div class="sig-box"><canvas id="sigCanvas1"></canvas></div>
    <button class="btn sm" onclick="limpiarFirma(1)">Limpiar</button>
    <hr class="sep">
    <div class="sl">Firma beneficiario / agricultor(a)</div>
    <div class="sig-box"><canvas id="sigCanvas2"></canvas></div>
    <button class="btn sm" onclick="limpiarFirma(2)">Limpiar</button>
    <hr class="sep">
    <div class="sl">Croquis esquemático</div>
    <p class="hint">Límites prediales · Emplazamiento obra · Accesos · Fuente de agua · Topografía · Caminos / canales</p>
    <div class="sig-box" style="border-style:solid"><canvas id="croquisCanvas" style="height:240px"></canvas></div>
    <button class="btn sm" onclick="limpiarCroquis()">Limpiar</button>`;
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
        <div style="font-weight:700;font-size:.8rem;margin-bottom:4px">${esc(a.etiqueta||'Sin nombre')}</div>
        <input value="${esc(a.etiqueta)}" onchange="renombrarAnexo(${i},this.value)" placeholder="Renombrar…">
      </div>
      <button class="btn sm warn" onclick="quitarAnexo(${i})">✕</button>
    </div>`).join('');
    return `<div class="sl">Documentos escaneados</div>
    <p class="hint">Primero ingresa el nombre del documento, luego toma la foto. Se recortará y enderezará automáticamente.</p>
    <input type="file" accept="image/*" capture="environment" id="anexoInput" style="display:none" onchange="iniciarEscaneo(event)">
    <button class="btn pri" onclick="pedirNombreYEscanear()">📄 Escanear documento</button>
    ${items}`;
  },

  exportar(){
    return `<div class="sl">Guardar / Exportar</div>
    <button class="btn pri" style="width:100%;margin-bottom:10px" onclick="guardarFicha().then(()=>toast('Guardado ✓'))">💾 Guardar ficha</button>
    <hr class="sep">
    <button class="btn" style="width:100%;margin-bottom:8px" onclick="exportarPDF()">📄 Generar ficha PDF</button>
    <button class="btn" style="width:100%;margin-bottom:8px" onclick="exportarJSONCompleto()">⬇ Exportar ficha completa (.json)</button>
    <button class="btn" style="width:100%;margin-bottom:8px" onclick="exportarJSONDisenador()">⬇ Exportar para Diseñador de Riego (.json)</button>`;
  }
};

// ---------- Guardar valores del paso actual ----------
function guardarPasoActual(){
  const s=STEPS[curStep].id;
  if(s==='contacto'){
    const c=F.contacto;
    c.nombre=val('ct-nombre');c.rut=val('ct-rut');c.telefono=val('ct-tel');
    c.region=val('ct-region');c.comuna=val('ct-comuna');c.sector=val('ct-sector');
  }else if(s==='proyecto'){
    const p=F.proyecto;
    p.nombreProyecto=val('pr-nombre');p.consultor=val('pr-consultor');p.rolAvaluo=val('pr-rol');
    p.supTotalHa=val('pr-suptot');p.supRegarHa=val('pr-supregar');
    p.sistemas=Object.keys(SISTEMA_MAP).filter(v=>val('pr-sys-'+v));
    p.coordNorte=val('pr-utmn');p.coordEste=val('pr-utme');p.huso=val('pr-huso');
  }else if(s==='fuente'){
    const f=F.fuente;
    f.tipo=val('fu-tipo');f.caracteristicas=val('fu-caract');f.observaciones=val('fu-obs');
    f.caudalLs=val('fu-caudal');f.horasRiegoDia=val('fu-horas');
    f.coordNorte=val('fu-utmn');f.coordEste=val('fu-utme');f.huso=val('fu-huso');
  }else if(s==='tenencia'){
    const t=F.tenencia;
    t.tipoTierra=val('te-tierra');t.docTierra=radioVal('te-doctierra');
    t.tipoDerecho=val('te-derecho');t.docAgua=radioVal('te-docagua');
  }else if(s==='superficie'){
    const a=F.sra,p=F.srf;
    a.cultivo=val('sra-cult');a.cultivoOtro=val('sra-cultotro');a.superficieM2=val('sra-sup');
    a.metodo=val('sra-met');a.meses=val('sra-meses');a.obras=val('sra-obras');
    p.cultivo=val('srf-cult');p.cultivoOtro=val('srf-cultotro');p.superficieM2=val('srf-sup');
    p.metodo=val('srf-met');p.meses=val('srf-meses');p.obras=val('srf-obras');
  }else if(s==='energia_otros'){
    const e=F.energia;e.tipoDisponible=val('en-disp');e.tipoProyectada=val('en-proy');e.observaciones=val('en-obs');
    const o=F.otros;o.inicioActividades=radioVal('ot-inicio');o.incluyeIVA=radioVal('ot-iva');o.usuarioIndap=radioVal('ot-indap');o.descripcion=val('ot-desc');
  }
  F.modificado=Date.now();
}

// ---------- GPS + UTM ----------
function capturarGPS(prefix){
  if(!navigator.geolocation){toast('GPS no disponible');return;}
  toast('Obteniendo ubicación…');
  navigator.geolocation.getCurrentPosition(pos=>{
    const utm=toUTM(pos.coords.latitude,pos.coords.longitude);
    document.getElementById(prefix+'-utmn').value=utm.n;
    document.getElementById(prefix+'-utme').value=utm.e;
    document.getElementById(prefix+'-huso').value=utm.zone;
    toast('Coordenadas capturadas ✓');
  },err=>toast('GPS: '+err.message),{enableHighAccuracy:true,timeout:15000});
}
function toUTM(lat,lon){
  const a=6378137,e=0.081819191,k0=0.9996;
  const zone=Math.floor((lon+180)/6)+1;
  const lonOrig=((zone-1)*6-180+3)*Math.PI/180;
  const latR=lat*Math.PI/180,lonR=lon*Math.PI/180;
  const eSq=e*e,ePSq=eSq/(1-eSq);
  const N=a/Math.sqrt(1-eSq*Math.sin(latR)**2);
  const T=Math.tan(latR)**2,C=ePSq*Math.cos(latR)**2,A=Math.cos(latR)*(lonR-lonOrig);
  const M=a*((1-eSq/4-3*eSq**2/64-5*eSq**3/256)*latR-(3*eSq/8+3*eSq**2/32+45*eSq**3/1024)*Math.sin(2*latR)+(15*eSq**2/256+45*eSq**3/1024)*Math.sin(4*latR)-(35*eSq**3/3072)*Math.sin(6*latR));
  let easting=k0*N*(A+(1-T+C)*A**3/6+(5-18*T+T**2+72*C-58*ePSq)*A**5/120)+500000;
  let northing=k0*(M+N*Math.tan(latR)*(A**2/2+(5-T+9*C+4*C**2)*A**4/24+(61-58*T+T**2+600*C-330*ePSq)*A**6/720));
  if(lat<0)northing+=10000000;
  return{n:Math.round(northing),e:Math.round(easting),zone};
}

// ---------- Firmas / Croquis ----------
function setupCanvasPad(id,initial,onEnd){
  const c=document.getElementById(id);if(!c)return;
  const dpr=window.devicePixelRatio||1,rect=c.getBoundingClientRect();
  c.width=rect.width*dpr;c.height=parseInt(c.style.height||'160')*dpr;
  const ctx=c.getContext('2d');ctx.scale(dpr,dpr);ctx.lineWidth=2.2;ctx.lineCap='round';ctx.strokeStyle='#0b2545';
  if(initial){const img=new Image();img.onload=()=>ctx.drawImage(img,0,0,rect.width,parseInt(c.style.height||'160'));img.src=initial;}
  let drawing=false,last=null;
  function pos(e){const r=c.getBoundingClientRect();const p=e.touches?e.touches[0]:e;return{x:p.clientX-r.left,y:p.clientY-r.top};}
  function start(e){drawing=true;last=pos(e);e.preventDefault();}
  function move(e){if(!drawing)return;const p=pos(e);ctx.beginPath();ctx.moveTo(last.x,last.y);ctx.lineTo(p.x,p.y);ctx.stroke();last=p;e.preventDefault();}
  function end(){if(drawing&&onEnd)onEnd(c.toDataURL('image/png'));drawing=false;}
  c.addEventListener('mousedown',start);c.addEventListener('mousemove',move);window.addEventListener('mouseup',end);
  c.addEventListener('touchstart',start,{passive:false});c.addEventListener('touchmove',move,{passive:false});c.addEventListener('touchend',end);
  c._ctx=ctx;c._h=parseInt(c.style.height||'160');
}
function initFirmas(){setupCanvasPad('sigCanvas1',F.firmaEncuestador,d=>F.firmaEncuestador=d);setupCanvasPad('sigCanvas2',F.firmaBeneficiario,d=>F.firmaBeneficiario=d);}
function limpiarFirma(n){const id=n===1?'sigCanvas1':'sigCanvas2';const c=document.getElementById(id);c._ctx.clearRect(0,0,c.width,c.height);if(n===1)F.firmaEncuestador='';else F.firmaBeneficiario='';}
function initCroquis(){setupCanvasPad('croquisCanvas',F.dibujoEsquematico,d=>F.dibujoEsquematico=d);}
function limpiarCroquis(){const c=document.getElementById('croquisCanvas');c._ctx.clearRect(0,0,c.width,c.height);F.dibujoEsquematico='';}

// ---------- Fotos ----------
function fileToDataUrl(file,maxDim=1600,q=0.82){
  return new Promise(res=>{const img=new Image();const r=new FileReader();r.onload=e=>{img.onload=()=>{let w=img.width,h=img.height;if(w>h&&w>maxDim){h=h*maxDim/w;w=maxDim;}else if(h>maxDim){w=w*maxDim/h;h=maxDim;}const cv=document.createElement('canvas');cv.width=w;cv.height=h;cv.getContext('2d').drawImage(img,0,0,w,h);res(cv.toDataURL('image/jpeg',q));};img.src=e.target.result;};r.readAsDataURL(file);});
}
async function agregarFoto(ev){
  const file=ev.target.files[0];if(!file)return;
  const dataUrl=await fileToDataUrl(file);F.fotos.push({id:uuid(),dataUrl});ev.target.value='';renderStep();
}
function quitarFoto(i){F.fotos.splice(i,1);renderStep();}

// ---------- Escaneo de documentos ----------
let _cropImg=null,_cropPts=null,_cropCanvasEl=null,_pendingAnexoName='';

function pedirNombreYEscanear(){
  const nombre=prompt('Nombre del documento a escanear:\n(ej: RUT, Escritura, DAA, Certificado)','');
  if(nombre===null)return;
  _pendingAnexoName=nombre.trim()||'Documento';
  document.getElementById('anexoInput').click();
}
function iniciarEscaneo(ev){
  const file=ev.target.files[0];if(!file)return;
  const r=new FileReader();r.onload=e=>{const img=new Image();img.onload=()=>{_cropImg=img;abrirModalCrop(img);};img.src=e.target.result;};r.readAsDataURL(file);ev.target.value='';
}
function abrirModalCrop(img){
  document.getElementById('cropModal').style.display='flex';
  const maxW=Math.min(window.innerWidth-60,560);
  const scale=Math.min(maxW/img.width,1);
  const w=img.width*scale,h=img.height*scale;
  const cv=document.getElementById('cropCanvas');cv.width=w;cv.height=h;
  cv.getContext('2d').drawImage(img,0,0,w,h);
  _cropCanvasEl=cv;
  const m=0.06;
  _cropPts=[{x:w*m,y:h*m},{x:w*(1-m),y:h*m},{x:w*(1-m),y:h*(1-m)},{x:w*m,y:h*(1-m)}];
  drawHandles();
}
function drawHandles(){
  document.querySelectorAll('.handle').forEach(h=>h.remove());
  const wrap=document.getElementById('cropWrap');const cv=_cropCanvasEl;
  _cropPts.forEach((p)=>{
    const h=document.createElement('div');h.className='handle';h.style.left=p.x+'px';h.style.top=p.y+'px';
    let dragging=false;
    function move(e){if(!dragging)return;const r=cv.getBoundingClientRect();const pt=e.touches?e.touches[0]:e;p.x=Math.max(0,Math.min(cv.width,pt.clientX-r.left));p.y=Math.max(0,Math.min(cv.height,pt.clientY-r.top));h.style.left=p.x+'px';h.style.top=p.y+'px';redrawOutline();e.preventDefault();}
    h.addEventListener('mousedown',()=>dragging=true);window.addEventListener('mousemove',move);window.addEventListener('mouseup',()=>dragging=false);
    h.addEventListener('touchstart',e=>{dragging=true;e.preventDefault();},{passive:false});h.addEventListener('touchmove',move,{passive:false});h.addEventListener('touchend',()=>dragging=false);
    wrap.appendChild(h);
  });redrawOutline();
}
function redrawOutline(){const cv=_cropCanvasEl,ctx=cv.getContext('2d');ctx.drawImage(_cropImg,0,0,cv.width,cv.height);ctx.strokeStyle='#2f7dc4';ctx.lineWidth=2;ctx.beginPath();_cropPts.forEach((p,i)=>i===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y));ctx.closePath();ctx.stroke();}
function cancelCrop(){document.getElementById('cropModal').style.display='none';}

function solveLinear(A,b){const n=A.length;const M=A.map((row,i)=>row.concat([b[i]]));for(let i=0;i<n;i++){let mr=i;for(let k=i+1;k<n;k++)if(Math.abs(M[k][i])>Math.abs(M[mr][i]))mr=k;[M[i],M[mr]]=[M[mr],M[i]];for(let k=i+1;k<n;k++){const f=M[k][i]/M[i][i];for(let j=i;j<=n;j++)M[k][j]-=f*M[i][j];}}const x=new Array(n).fill(0);for(let i=n-1;i>=0;i--){let s=M[i][n];for(let j=i+1;j<n;j++)s-=M[i][j]*x[j];x[i]=s/M[i][i];}return x;}
function computeH(src,dst){const A=[];for(let i=0;i<4;i++){const{x:sx,y:sy}=src[i],{x:dx,y:dy}=dst[i];A.push([sx,sy,1,0,0,0,-dx*sx,-dx*sy]);A.push([0,0,0,sx,sy,1,-dy*sx,-dy*sy]);}const b=[];dst.forEach(p=>{b.push(p.x);b.push(p.y);});const h=solveLinear(A,b);return[h[0],h[1],h[2],h[3],h[4],h[5],h[6],h[7],1];}
function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}

function applyCrop(){
  const p=_cropPts;
  const outW=Math.round(Math.max(dist(p[0],p[1]),dist(p[3],p[2])));
  const outH=Math.round(Math.max(dist(p[0],p[3]),dist(p[1],p[2])));
  const sx=_cropImg.width/_cropCanvasEl.width,sy=_cropImg.height/_cropCanvasEl.height;
  const srcPts=p.map(pt=>({x:pt.x*sx,y:pt.y*sy}));
  const dstPts=[{x:0,y:0},{x:outW,y:0},{x:outW,y:outH},{x:0,y:outH}];
  const H=computeH(dstPts,srcPts);
  const sc=document.createElement('canvas');sc.width=_cropImg.width;sc.height=_cropImg.height;sc.getContext('2d').drawImage(_cropImg,0,0);
  const sd=sc.getContext('2d').getImageData(0,0,sc.width,sc.height).data,sw=sc.width,sh=sc.height;
  const oc=document.createElement('canvas');oc.width=outW;oc.height=outH;
  const octx=oc.getContext('2d'),od=octx.createImageData(outW,outH);
  for(let y=0;y<outH;y++){for(let x=0;x<outW;x++){const den=H[6]*x+H[7]*y+H[8];const sx2=(H[0]*x+H[1]*y+H[2])/den,sy2=(H[3]*x+H[4]*y+H[5])/den;const io=(y*outW+x)*4;if(sx2>=0&&sx2<sw-1&&sy2>=0&&sy2<sh-1){const x0=Math.floor(sx2),y0=Math.floor(sy2),fx=sx2-x0,fy=sy2-y0;for(let c=0;c<3;c++){const p00=sd[(y0*sw+x0)*4+c],p10=sd[(y0*sw+x0+1)*4+c],p01=sd[((y0+1)*sw+x0)*4+c],p11=sd[((y0+1)*sw+x0+1)*4+c];od.data[io+c]=p00+(p10-p00)*fx+(p01-p00)*fy+(p11-p10-p01+p00)*fx*fy;}od.data[io+3]=255;}else{od.data[io]=od.data[io+1]=od.data[io+2]=255;od.data[io+3]=255;}}}
  octx.putImageData(od,0,0);
  const dataUrl=oc.toDataURL('image/jpeg',0.86);
  F.anexos.push({id:uuid(),etiqueta:_pendingAnexoName,dataUrl});
  document.getElementById('cropModal').style.display='none';
  renderStep();
}
function renombrarAnexo(i,v){F.anexos[i].etiqueta=v;}
function quitarAnexo(i){F.anexos.splice(i,1);renderStep();}

// ---------- JSON exports ----------
function nombreBase(){return ((F.contacto.nombre||'ficha').trim().replace(/\s+/g,'_').replace(/[^\w-]/g,'')||'ficha')+'_'+F.fecha;}
function descargar(nombre,contenido,mime){const blob=new Blob([contenido],{type:mime});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=nombre;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(url);a.remove();},1500);}
function exportarJSONCompleto(){guardarPasoActual();descargar(nombreBase()+'.json',JSON.stringify(F,null,2),'application/json');toast('JSON completo exportado');}

function exportarJSONDisenador(){
  guardarPasoActual();
  const sistemas=F.proyecto.sistemas||[];
  if(!sistemas.length){toast('Selecciona al menos un sistema de riego en "Proyecto"');return;}
  sistemas.forEach(sys=>{
    const pfx=PFX[sys];const p=F.proyecto,c=F.contacto,fu=F.fuente,te=F.tenencia,cp=F.srf;
    const cultivoFinal=cp.cultivo==='Otro'?cp.cultivoOtro:cp.cultivo;
    const fields={};
    fields[pfx+'-consultor']=p.consultor||'';
    fields[pfx+'-nombre-proy']=p.nombreProyecto||'';
    fields[pfx+'-prop']=c.nombre||'';
    fields[pfx+'-rol']=p.rolAvaluo||'';
    fields[pfx+'-sec']=c.sector||'';
    fields[pfx+'-com']=c.comuna||'';
    fields[pfx+'-huso']=p.huso||'';
    fields[pfx+'-utmn']=p.coordNorte||'';
    fields[pfx+'-utme']=p.coordEste||'';
    const supId=DR_SUP_REGAR[sys];if(supId)fields[supId]=p.supRegarHa||'';
    if(sys==='asp'&&p.supTotalHa)fields['a-sttot']=p.supTotalHa;
    fields[pfx+'-cult']=cultivoFinal||'';
    fields[pfx+'-tfue']=fu.tipo||'';
    fields[pfx+'-der-tipo']=te.tipoDerecho||'';
    fields[pfx+'-q']=fu.caudalLs||'';
    fields[pfx+'-hrs']=fu.horasRiegoDia||'';
    const out={__sys:sys,__name:p.nombreProyecto||c.nombre||'Proyecto',__date:new Date().toLocaleString('es-CL'),fields};
    descargar(nombreBase()+'_'+SISTEMA_MAP[sys]+'.json',JSON.stringify(out,null,2),'application/json');
  });
  toast(`${sistemas.length} archivo(s) exportados`);
}

// ---------- PDF ----------
function exportarPDF(){
  guardarPasoActual();
  const F_=F,c=F_.contacto,p=F_.proyecto,fu=F_.fuente,te=F_.tenencia;
  const a=F_.sra,sf=F_.srf,en=F_.energia,ot=F_.otros;
  const cult=v=>v&&v.cultivo==='Otro'?v.cultivoOtro:(v?v.cultivo:'');
  const S={
    lbl:'background:#edf3f9;font-weight:700;padding:5px 8px;border:1px solid #b8c9db;width:35%;vertical-align:top;font-size:10px',
    val:'background:#fff;padding:5px 8px;border:1px solid #b8c9db;vertical-align:top;font-size:10.5px',
    thd:'background:#1e3a5f;color:#fff;font-weight:700;padding:5px 8px;border:1px solid #0b2545;text-align:center;font-size:10px',
    tdc:'background:#edf3f9;font-weight:600;padding:5px 8px;border:1px solid #b8c9db;font-size:10px',
    tda:'background:#fff;padding:5px 8px;border:1px solid #b8c9db;text-align:center;font-size:10.5px'
  };
  const sec=t=>`<div style="background:#1e3a5f;color:#fff;font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:.04em;padding:5px 8px;margin-top:10px">${t}</div>`;
  const tbl=(...rows)=>`<table style="width:100%;border-collapse:collapse">${rows.join('')}</table>`;
  const row=(l,v,l2,v2)=>l2!==undefined
    ?`<tr><td style="${S.lbl}">${l}</td><td style="${S.val}">${esc(v)}</td><td style="${S.lbl}">${l2}</td><td style="${S.val}">${esc(v2)}</td></tr>`
    :`<tr><td style="${S.lbl}">${l}</td><td style="${S.val}" colspan="3">${esc(v)}</td></tr>`;
  const coord=(n,e,h)=>n?`N ${n} · E ${e} · H ${h}`:'—';

  const html=`<div style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:720px;margin:0 auto">
  <h2 style="text-align:center;margin:0 0 2px;font-size:14px">FICHA VISITA TERRENO</h2>
  <p style="text-align:center;margin:0 0 6px;font-size:11px;font-weight:400">Para levantamiento de demanda</p>
  <div style="display:flex;justify-content:space-between;font-size:10.5px;margin-bottom:2px">
    <span><b>Fecha:</b> ${esc(F_.fecha)}</span><span><b>Proyecto:</b> ${esc(p.nombreProyecto)}</span>
  </div>

  ${sec('Beneficiario')}
  ${tbl(row('Nombre',c.nombre,'RUT',c.rut),row('Teléfono',c.telefono,'Región',c.region),row('Comuna',c.comuna,'Sector / Localidad',c.sector))}

  ${sec('Proyecto')}
  ${tbl(row('Consultor / Empresa',p.consultor,'ROL de Avalúo (SII)',p.rolAvaluo),
    row('Sistema(s) de riego',(p.sistemas||[]).map(s=>SISTEMA_MAP[s]).join(', ')||'—','Sup. Total / Sup. a Regar [ha]',(p.supTotalHa||'—')+' / '+(p.supRegarHa||'—')),
    row('Coordenadas proyecto',coord(p.coordNorte,p.coordEste,p.huso),'',''))}

  ${sec('1. Fuente de agua')}
  ${tbl(row('Tipo fuente',fu.tipo,'Coord. captación',coord(fu.coordNorte,fu.coordEste,fu.huso)),
    row('Características',fu.caracteristicas,'Observaciones',fu.observaciones),
    row('Caudal disponible [l/s]',fu.caudalLs||'—','Horas de riego disp. [hr/día]',fu.horasRiegoDia||'—'))}

  ${sec('2. Tenencia de tierra y agua')}
  ${tbl(row('Tipo tenencia de la tierra',te.tipoTierra,'Documentos vista tierra',te.docTierra),
    row('Tipo de derecho de agua',te.tipoDerecho,'Documentos vista agua',te.docAgua))}

  ${sec('3. Superficie de riego')}
  <table style="width:100%;border-collapse:collapse">
    <tr><td style="${S.tdc}"></td><td style="${S.thd}">Superficie actual (SRA)</td><td style="${S.thd}">Superficie futura (SRF)</td></tr>
    <tr><td style="${S.tdc}">Cultivo</td><td style="${S.tda}">${esc(cult(a))}</td><td style="${S.tda}">${esc(cult(sf))}</td></tr>
    <tr><td style="${S.tdc}">Superficie [m²]</td><td style="${S.tda}">${esc(a.superficieM2)}</td><td style="${S.tda}">${esc(sf.superficieM2)}</td></tr>
    <tr><td style="${S.tdc}">Método de riego</td><td style="${S.tda}">${esc(a.metodo)}</td><td style="${S.tda}">${esc(sf.metodo)}</td></tr>
    <tr><td style="${S.tdc}">Meses</td><td style="${S.tda}">${esc(a.meses)}</td><td style="${S.tda}">${esc(sf.meses)}</td></tr>
    <tr><td style="${S.tdc}">Obras</td><td style="${S.tda}">${esc(a.obras)}</td><td style="${S.tda}">${esc(sf.obras)}</td></tr>
  </table>

  ${sec('4. Energía')}
  ${tbl(row('Tipo disponible',en.tipoDisponible,'Tipo proyectada',en.tipoProyectada),row('Observaciones',en.observaciones,'',''))}

  ${sec('5. Otros antecedentes')}
  ${tbl(row('Con inicio de actividades',ot.inicioActividades,'Proyecto incluye IVA',ot.incluyeIVA),row('Usuario INDAP',ot.usuarioIndap,'Descripción',ot.descripcion))}

  <div style="display:flex;gap:40px;margin-top:28px;page-break-inside:avoid">
    <div style="flex:1;text-align:center">
      <div style="height:72px;display:flex;align-items:flex-end;justify-content:center">${F_.firmaEncuestador?`<img src="${F_.firmaEncuestador}" style="max-height:72px">`:''}</div>
      <div style="border-top:1.5px solid #333;margin-top:6px;padding-top:4px;font-size:9.5px">Firma encuestador / consultor</div>
    </div>
    <div style="flex:1;text-align:center">
      <div style="height:72px;display:flex;align-items:flex-end;justify-content:center">${F_.firmaBeneficiario?`<img src="${F_.firmaBeneficiario}" style="max-height:72px">`:''}</div>
      <div style="border-top:1.5px solid #333;margin-top:6px;padding-top:4px;font-size:9.5px">Firma beneficiario / agricultor(a)</div>
    </div>
  </div>

  ${F_.dibujoEsquematico?`<div style="page-break-before:always">${sec('Croquis esquemático')}<img src="${F_.dibujoEsquematico}" style="width:100%;border:1px solid #b8c9db;margin-top:6px"></div>`:''}
  ${F_.fotos.length?`<div style="page-break-before:always">${sec('Fotos referenciales')}<div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:8px">${F_.fotos.map(f=>`<img src="${f.dataUrl}" style="width:calc(50% - 5px);border:1px solid #b8c9db;border-radius:4px">`).join('')}</div></div>`:''}
  ${F_.anexos.length?`<div style="page-break-before:always">${sec('Documentos anexos')}${F_.anexos.map((ax,i)=>`<div style="page-break-inside:avoid;margin-top:12px"><div style="font-weight:700;font-size:10.5px;margin-bottom:4px">${i+1}. ${esc(ax.etiqueta||'Documento')}</div><img src="${ax.dataUrl}" style="width:100%;border:1px solid #b8c9db;border-radius:4px"></div>`).join('')}</div>`:''}
</div>`;

  const w=window.open('','_blank');
  w.document.write(`<html><head><title>Ficha — ${esc(c.nombre||'terreno')}</title><style>@page{size:letter;margin:15mm}body{margin:0}</style></head><body>${html}</body></html>`);
  w.document.close();setTimeout(()=>w.print(),500);
}

// ---------- Init ----------
(async function init(){
  await idbOpen();await goHome();
  if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
})();
