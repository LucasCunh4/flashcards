const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];

const els={
  total:$('#totalCount'),due:$('#dueCount'),mastered:$('#masteredCount'),today:$('#todayCount'),
  studyBtn:$('#studyBtn'),shuffleBtn:$('#shuffleBtn'),newBtn:$('#newBtn'),emptyNewBtn:$('#emptyNewBtn'),
  exportBtn:$('#exportBtn'),importBtn:$('#importBtn'),importInput:$('#importInput'),
  prImportBtn:$('#prImportBtn'),prImportPanel:$('#prImportPanel'),closePrImportBtn:$('#closePrImportBtn'),
  prInput:$('#prInput'),prStatus:$('#prStatus'),prError:$('#prError'),prPreviewSection:$('#prPreviewSection'),
  prPreview:$('#prPreview'),prPreviewInfo:$('#prPreviewInfo'),clearPrBtn:$('#clearPrBtn'),savePrBtn:$('#savePrBtn'),
  editor:$('#editorPanel'),editorTitle:$('#editorTitle'),editorDesc:$('#editorDesc'),bulkToggle:$('#bulkToggle'),
  form:$('#cardForm'),editId:$('#editId'),question:$('#question'),answer:$('#answer'),singleArea:$('#singleArea'),
  imageInput:$('#imageInput'),imageControls:$('#imageControls'),imagePreviewWrap:$('#imagePreviewWrap'),
  imagePreview:$('#imagePreview'),removeImage:$('#removeImageBtn'),svgControls:$('#svgControls'),
  svgInput:$('#svgInput'),previewSvgBtn:$('#previewSvgBtn'),clearSvgBtn:$('#clearSvgBtn'),
  svgPreviewWrap:$('#svgPreviewWrap'),svgPreview:$('#svgPreview'),
  bulkArea:$('#bulkArea'),bulkImageInput:$('#bulkImageInput'),bulkItems:$('#bulkItems'),bulkCount:$('#bulkCount'),
  openBulkSvgBtn:$('#openBulkSvgBtn'),bulkSvgBox:$('#bulkSvgBox'),bulkSvgInput:$('#bulkSvgInput'),
  addBulkSvgBtn:$('#addBulkSvgBtn'),cancelBulkSvgBtn:$('#cancelBulkSvgBtn'),
  closeEditor:$('#closeEditorBtn'),cancelBtn:$('#cancelBtn'),search:$('#searchInput'),list:$('#cardList'),
  empty:$('#emptyState'),listSubtitle:$('#listSubtitle'),cardsPanel:$('#cardsPanel'),
  selectModeBtn:$('#selectModeBtn'),selectionToolbar:$('#selectionToolbar'),selectionCount:$('#selectionCount'),
  selectAllBtn:$('#selectAllBtn'),deleteSelectedBtn:$('#deleteSelectedBtn'),cancelSelectionBtn:$('#cancelSelectionBtn'),
  studyView:$('#studyView'),exitStudy:$('#exitStudyBtn'),fullscreen:$('#fullscreenBtn'),
  studyProgressText:$('#studyProgressText'),studyDueText:$('#studyDueText'),studyProgressBar:$('#studyProgressBar'),
  studyQuestion:$('#studyQuestion'),studyImage:$('#studyImage'),showAnswer:$('#showAnswerBtn'),
  answerArea:$('#answerArea'),studyAnswer:$('#studyAnswer'),ratingArea:$('#ratingArea'),
  toast:$('#toast'),themeBtn:$('#themeBtn')
};

const DB_NAME='flashcards_app',STORE='cards',DAY=86400000,MINUTE=60000;
let db,cards=[],editingImage=null,editingSvg=null,singleMediaMode='image',bulkMode=false,bulkEntries=[],
parsedPrItems=[],prParseTimer,studyQueue=[],studyCurrent=null,sessionTotal=0,sessionDone=new Set(),
shuffled=false,toastTimer,selectionMode=false,selectedIds=new Set();

function openDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,1);req.onupgradeneeded=e=>{const d=e.target.result;if(!d.objectStoreNames.contains(STORE))d.createObjectStore(STORE,{keyPath:'id',autoIncrement:true})};req.onsuccess=()=>{db=req.result;resolve()};req.onerror=()=>reject(req.error)})}
function tx(mode='readonly'){return db.transaction(STORE,mode).objectStore(STORE)}
function dbGetAll(){return new Promise((res,rej)=>{const r=tx().getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function dbAdd(card){return new Promise((res,rej)=>{const r=tx('readwrite').add(card);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function dbPut(card){return new Promise((res,rej)=>{const r=tx('readwrite').put(card);r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
function dbDelete(id){return new Promise((res,rej)=>{const r=tx('readwrite').delete(id);r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
function dbClear(){return new Promise((res,rej)=>{const r=tx('readwrite').clear();r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
function dbBulkAdd(items){return new Promise((res,rej)=>{const t=db.transaction(STORE,'readwrite'),s=t.objectStore(STORE);items.forEach(c=>{const copy={...c};delete copy.id;s.add(copy)});t.oncomplete=()=>res();t.onerror=()=>rej(t.error)})}
function dbBulkDelete(ids){return new Promise((res,rej)=>{const t=db.transaction(STORE,'readwrite'),s=t.objectStore(STORE);ids.forEach(id=>s.delete(id));t.oncomplete=()=>res();t.onerror=()=>rej(t.error)})}

const now=()=>Date.now(),isDue=c=>!c.nextReview||c.nextReview<=now(),
sameDay=(a,b)=>new Date(a).toDateString()===new Date(b).toDateString(),
svgDataUrl=svg=>'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg),
cardMedia=c=>c.svg?svgDataUrl(c.svg):(c.image||null);

function fmtDate(ts){
  if(!ts||ts<=now())return'Agora';
  const diff=Math.ceil((ts-now())/DAY);
  if(diff===1)return'Amanhã';
  if(diff<7)return`Em ${diff} dias`;
  return new Date(ts).toLocaleDateString('pt-BR',{day:'2-digit',month:'short'});
}

function toast(msg){
  clearTimeout(toastTimer);
  els.toast.textContent=msg;
  els.toast.classList.add('show');
  toastTimer=setTimeout(()=>els.toast.classList.remove('show'),2300);
}

function shuffle(a){
  for(let i=a.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}

function filteredCards(){
  const q=els.search.value.trim().toLowerCase();
  return cards.filter(c=>!q||c.question.toLowerCase().includes(q)||c.answer.toLowerCase().includes(q));
}

/* SELEÇÃO MÚLTIPLA */

function setSelectionMode(on){
  selectionMode=on;
  if(!on)selectedIds.clear();

  els.selectionToolbar.classList.toggle('hidden',!on);
  els.selectModeBtn.classList.toggle('active-toggle',on);
  els.selectModeBtn.textContent=on?'✓ Selecionando':'☑ Selecionar';

  updateSelectionToolbar();
  render();
}

function updateSelectionToolbar(){
  const visible=filteredCards();
  const selectedVisible=visible.filter(c=>selectedIds.has(c.id)).length;

  els.selectionCount.textContent=selectedIds.size;
  els.deleteSelectedBtn.disabled=selectedIds.size===0;

  els.selectAllBtn.textContent=
    visible.length&&selectedVisible===visible.length
      ?'Desmarcar visíveis'
      :'Selecionar tudo';
}

function toggleSelected(id,checked){
  if(checked)selectedIds.add(id);
  else selectedIds.delete(id);

  updateSelectionToolbar();

  const row=document.querySelector(`[data-card-id="${id}"]`);
  if(row)row.classList.toggle('selected',checked);
}

els.selectModeBtn.onclick=()=>{
  if(!cards.length)return toast('Não há flashcards para selecionar.');
  setSelectionMode(!selectionMode);
};

els.cancelSelectionBtn.onclick=()=>setSelectionMode(false);

els.selectAllBtn.onclick=()=>{
  const visible=filteredCards();
  if(!visible.length)return;

  const allSelected=visible.every(c=>selectedIds.has(c.id));

  visible.forEach(c=>{
    if(allSelected)selectedIds.delete(c.id);
    else selectedIds.add(c.id);
  });

  updateSelectionToolbar();
  render();
};

els.deleteSelectedBtn.onclick=async()=>{
  const ids=[...selectedIds];
  if(!ids.length)return;

  const text=ids.length===1
    ?'Excluir o flashcard selecionado?'
    :`Excluir os ${ids.length} flashcards selecionados?`;

  if(!confirm(`${text}\n\nEsta ação não pode ser desfeita.`))return;

  try{
    await dbBulkDelete(ids);
    selectedIds.clear();
    selectionMode=false;
    els.selectionToolbar.classList.add('hidden');
    els.selectModeBtn.classList.remove('active-toggle');
    els.selectModeBtn.textContent='☑ Selecionar';

    await loadCards();
    toast(`${ids.length} ${ids.length===1?'flashcard excluído':'flashcards excluídos'}.`);
  }catch(e){
    console.error(e);
    toast('Não foi possível excluir os flashcards.');
  }
};

/* IMPORTAR P/R */

function parsePR(text){
  const lines=text.replace(/\r/g,'').split('\n'),items=[];
  let current=null,mode=null;

  const finish=()=>{
    if(!current)return;
    current.question=current.question.trim();
    current.answer=current.answer.trim();
    items.push(current);
    current=null;mode=null;
  };

  lines.forEach((line,index)=>{
    const p=line.match(/^\s*P\s*:\s*(.*)$/i),r=line.match(/^\s*R\s*:\s*(.*)$/i);

    if(p){
      finish();
      current={question:p[1]||'',answer:'',line:index+1};
      mode='question';
      return;
    }

    if(r){
      if(!current)current={question:'',answer:r[1]||'',line:index+1};
      else current.answer=r[1]||'';
      mode='answer';
      return;
    }

    if(!current||!mode)return;

    if(line.trim()){
      if(mode==='question')current.question+=(current.question?'\n':'')+line.trimEnd();
      else current.answer+=(current.answer?'\n':'')+line.trimEnd();
    }
  });

  finish();

  const errors=[];
  items.forEach((item,index)=>{
    if(!item.question)errors.push(`Flashcard ${index+1}: pergunta vazia.`);
    else if(!item.answer)errors.push(`Flashcard ${index+1}: resposta vazia.`);
  });

  return{items,errors};
}

function openPrImporter(){
  closeEditor();
  els.prImportPanel.classList.remove('hidden');
  els.prImportPanel.scrollIntoView({behavior:'smooth',block:'start'});
  setTimeout(()=>els.prInput.focus(),200);
}

function closePrImporter(){els.prImportPanel.classList.add('hidden')}

function updatePrPreview(){
  const raw=els.prInput.value,{items,errors}=parsePR(raw);
  parsedPrItems=items;
  els.prPreview.innerHTML='';

  const count=items.length;
  els.prStatus.querySelector('strong').textContent=count;
  els.prStatus.querySelector('span').textContent=count===1?'flashcard identificado':'flashcards identificados';
  els.prStatus.className='pr-status '+(!raw.trim()?'neutral':errors.length||!count?'invalid':'valid');

  if(!raw.trim()){
    els.prError.classList.add('hidden');
    els.prPreviewSection.classList.add('hidden');
    els.savePrBtn.disabled=true;
    return;
  }

  if(errors.length){
    els.prError.classList.remove('hidden');
    els.prError.textContent=errors.slice(0,3).join(' · ');
    els.savePrBtn.disabled=true;
  }else{
    els.prError.classList.toggle('hidden',!!count);
    if(!count)els.prError.textContent='Não encontrei blocos P: e R:.';
    els.savePrBtn.disabled=!count;
  }

  els.prPreviewSection.classList.toggle('hidden',!count);
  if(!count)return;

  els.prPreviewInfo.textContent=`${count} ${count===1?'flashcard':'flashcards'}`;

  items.slice(0,30).forEach((item,index)=>{
    const card=document.createElement('article');
    card.className='pr-preview-card';
    card.innerHTML=`<div class="pr-preview-number">${index+1}</div>`;

    const content=document.createElement('div'),q=document.createElement('div'),r=document.createElement('div');
    q.className='pr-preview-q';q.textContent=item.question;
    r.className='pr-preview-r';r.textContent='R: '+item.answer;

    content.append(q,r);
    card.appendChild(content);
    els.prPreview.appendChild(card);
  });
}

els.prImportBtn.onclick=openPrImporter;
els.closePrImportBtn.onclick=closePrImporter;
els.prInput.addEventListener('input',()=>{
  clearTimeout(prParseTimer);
  prParseTimer=setTimeout(updatePrPreview,180);
});
els.clearPrBtn.onclick=()=>{els.prInput.value='';updatePrPreview()};

els.savePrBtn.onclick=async()=>{
  const {items,errors}=parsePR(els.prInput.value);
  if(!items.length||errors.length)return toast('Confira as perguntas e respostas.');

  const t=now();

  await dbBulkAdd(items.map(x=>({
    question:x.question,answer:x.answer,image:null,svg:null,createdAt:t,updatedAt:t,
    reviews:0,lapses:0,ease:2.3,interval:0,nextReview:0,lastReviewed:null
  })));

  els.prInput.value='';
  updatePrPreview();
  closePrImporter();
  await loadCards();

  toast(`${items.length} flashcards importados.`);
};

/* SVG */

function sanitizeSvg(raw){
  if(!raw||!raw.trim())throw new Error('SVG vazio');

  const doc=new DOMParser().parseFromString(raw.trim(),'image/svg+xml');
  if(doc.querySelector('parsererror')||doc.documentElement.tagName.toLowerCase()!=='svg')throw new Error('SVG inválido');

  const root=doc.documentElement;

  'script,foreignObject,iframe,object,embed,link,meta,audio,video'.split(',').forEach(tag=>
    root.querySelectorAll(tag).forEach(el=>el.remove())
  );

  [root,...root.querySelectorAll('*')].forEach(el=>{
    [...el.attributes].forEach(attr=>{
      const name=attr.name.toLowerCase(),value=attr.value.trim();
      if(name.startsWith('on'))el.removeAttribute(attr.name);
      if((name==='href'||name==='xlink:href')&&value&&!value.startsWith('#'))el.removeAttribute(attr.name);
    });
  });

  if(!root.getAttribute('xmlns'))root.setAttribute('xmlns','http://www.w3.org/2000/svg');
  return new XMLSerializer().serializeToString(root);
}

function extractSvgs(raw){
  if(!raw.trim())return[];
  const doc=new DOMParser().parseFromString(`<body>${raw}</body>`,'text/html');
  return [...doc.body.querySelectorAll('svg')].filter(svg=>!svg.parentElement?.closest('svg')).map(svg=>sanitizeSvg(svg.outerHTML));
}

/* RENDER */

async function loadCards(){cards=await dbGetAll();render()}

function render(){
  const filtered=filteredCards(),due=cards.filter(isDue).length;
  const mastered=cards.filter(c=>(c.interval||0)>=21).length;
  const today=cards.filter(c=>c.lastReviewed&&sameDay(c.lastReviewed,Date.now())).length;
  const q=els.search.value.trim();

  els.total.textContent=cards.length;
  els.due.textContent=due;
  els.mastered.textContent=mastered;
  els.today.textContent=today;
  els.studyBtn.innerHTML=due?`<span>▶</span> Estudar agora <b>${due}</b>`:'<span>▶</span> Estudar agora';
  els.listSubtitle.textContent=cards.length?`${cards.length} ${cards.length===1?'cartão cadastrado':'cartões cadastrados'}.`:'Nenhum cartão cadastrado.';
  els.list.innerHTML='';
  els.empty.classList.toggle('hidden',cards.length>0||q.length>0);

  if(!filtered.length&&q){
    const d=document.createElement('div');
    d.className='empty-state';
    d.innerHTML='<div class="empty-visual">⌕</div><h3>Nada encontrado</h3><p>Tente buscar por outro termo.</p>';
    els.list.appendChild(d);
  }else{
    filtered.sort((a,b)=>(isDue(b)-isDue(a))||((a.nextReview||0)-(b.nextReview||0)))
      .forEach(c=>els.list.appendChild(cardRow(c)));
  }

  updateSelectionToolbar();
}

function cardRow(c){
  const row=document.createElement('article');
  row.className='list-card'+(selectionMode?' selecting':'')+(selectedIds.has(c.id)?' selected':'');
  row.dataset.cardId=c.id;

  if(selectionMode){
    const box=document.createElement('label');
    box.className='select-box';

    const cb=document.createElement('input');
    cb.type='checkbox';
    cb.checked=selectedIds.has(c.id);
    cb.setAttribute('aria-label','Selecionar flashcard');
    cb.onchange=()=>toggleSelected(c.id,cb.checked);

    box.appendChild(cb);
    row.appendChild(box);
  }

  const src=cardMedia(c);
  const media=src
    ?Object.assign(document.createElement('img'),{className:'thumb',src,alt:''})
    :Object.assign(document.createElement('div'),{className:'thumb-placeholder',textContent:'✦'});

  const content=document.createElement('div');
  content.className='list-content';

  const q=document.createElement('div');
  q.className='list-question';
  q.textContent=c.question;

  const a=document.createElement('div');
  a.className='list-answer';
  a.textContent=c.answer;

  const meta=document.createElement('div');
  meta.className='list-meta';

  const status=document.createElement('span');
  status.className='badge'+(isDue(c)?' due':'');
  status.textContent=isDue(c)?'Revisar agora':`Revisão: ${fmtDate(c.nextReview)}`;

  const rev=document.createElement('span');
  rev.className='badge';
  rev.textContent=`${c.reviews||0} revisões`;

  meta.append(status,rev);

  if(c.svg){
    const b=document.createElement('span');
    b.className='badge';b.textContent='SVG';
    meta.appendChild(b);
  }

  content.append(q,a,meta);
  row.append(media,content);

  if(!selectionMode){
    const actions=document.createElement('div');
    actions.className='card-actions';

    const edit=document.createElement('button'),del=document.createElement('button');
    edit.className='small-btn';edit.type='button';edit.textContent='✎';edit.onclick=()=>openEditor(c.id);
    del.className='small-btn delete';del.type='button';del.textContent='⌫';del.onclick=()=>removeCard(c.id);

    actions.append(edit,del);
    row.appendChild(actions);
  }

  return row;
}

/* EDITOR */

function setSingleMediaMode(mode){
  singleMediaMode=mode;
  $$('[data-media]').forEach(btn=>btn.classList.toggle('active',btn.dataset.media===mode));
  els.imageControls.classList.toggle('hidden',mode!=='image');
  els.svgControls.classList.toggle('hidden',mode!=='svg');
}

$$('[data-media]').forEach(btn=>btn.onclick=()=>setSingleMediaMode(btn.dataset.media));

function setBulkMode(on){
  bulkMode=on;
  els.bulkToggle.classList.toggle('active-toggle',on);
  els.bulkToggle.textContent=on?'✓ Modo lote ativado':'▦ Modo lote';
  els.singleArea.classList.toggle('hidden',on);
  els.bulkArea.classList.toggle('hidden',!on);
  els.answer.required=!on;

  if(!on){
    bulkEntries=[];
    els.bulkSvgInput.value='';
    els.bulkSvgBox.classList.add('hidden');
    renderBulkEntries();
  }
}

function openEditor(id=null){
  closePrImporter();
  if(selectionMode)setSelectionMode(false);

  els.editor.classList.remove('hidden');
  els.form.reset();
  els.editId.value='';
  editingImage=null;editingSvg=null;bulkEntries=[];
  setBulkMode(false);setSingleMediaMode('image');
  updateImagePreview();updateSvgPreview();
  els.bulkToggle.classList.remove('hidden');

  if(id){
    const c=cards.find(x=>x.id===id);
    if(!c)return;

    els.editorTitle.textContent='Editar flashcard';
    els.bulkToggle.classList.add('hidden');
    els.editId.value=c.id;
    els.question.value=c.question;
    els.answer.value=c.answer;

    if(c.svg){
      editingSvg=c.svg;
      els.svgInput.value=c.svg;
      setSingleMediaMode('svg');
      updateSvgPreview();
    }else{
      editingImage=c.image||null;
      updateImagePreview();
    }
  }else els.editorTitle.textContent='Novo flashcard';

  els.editor.scrollIntoView({behavior:'smooth'});
}

function closeEditor(){
  els.editor.classList.add('hidden');
  els.form.reset();
  els.editId.value='';
  editingImage=null;editingSvg=null;bulkEntries=[];
  setBulkMode(false);setSingleMediaMode('image');
  updateImagePreview();updateSvgPreview();
}

function updateImagePreview(){
  const has=!!editingImage;
  els.imagePreviewWrap.classList.toggle('hidden',!has);
  els.removeImage.classList.toggle('hidden',!has);
  if(has)els.imagePreview.src=editingImage;
}

function updateSvgPreview(){
  const has=!!editingSvg;
  els.svgPreviewWrap.classList.toggle('hidden',!has);
  if(has)els.svgPreview.src=svgDataUrl(editingSvg);
}

async function imageToDataURL(file,max=1600,quality=.82){
  const url=URL.createObjectURL(file);
  try{
    const img=await new Promise((res,rej)=>{
      const im=new Image();im.onload=()=>res(im);im.onerror=rej;im.src=url;
    });

    let{width,height}=img;
    if(width>max||height>max){
      const s=Math.min(max/width,max/height);
      width=Math.round(width*s);height=Math.round(height*s);
    }

    const canvas=document.createElement('canvas');
    canvas.width=width;canvas.height=height;
    canvas.getContext('2d').drawImage(img,0,0,width,height);

    return canvas.toDataURL('image/jpeg',quality);
  }finally{URL.revokeObjectURL(url)}
}

els.previewSvgBtn.onclick=()=>{
  try{
    editingSvg=sanitizeSvg(els.svgInput.value);
    updateSvgPreview();
    toast('SVG válido.');
  }catch(e){toast('SVG inválido.')}
};

els.clearSvgBtn.onclick=()=>{editingSvg=null;els.svgInput.value='';updateSvgPreview()};

function renderBulkEntries(){
  els.bulkItems.innerHTML='';
  els.bulkCount.textContent=bulkEntries.length?`${bulkEntries.length} itens adicionados`:'Nenhum item adicionado';

  bulkEntries.forEach((entry,index)=>{
    const item=document.createElement('article');
    item.className='bulk-item';

    const media=document.createElement('div');
    media.className='bulk-media';
    media.innerHTML=`<img alt=""><span class="bulk-type">${entry.type==='svg'?'SVG':'FOTO'}</span>`;
    media.querySelector('img').src=entry.type==='svg'?svgDataUrl(entry.svg):entry.image;

    const body=document.createElement('div'),head=document.createElement('div'),ta=document.createElement('textarea');
    head.className='bulk-item-head';
    head.innerHTML=`<strong>Flashcard ${index+1}</strong>`;

    const remove=document.createElement('button');
    remove.className='small-btn delete';remove.type='button';remove.textContent='×';
    remove.onclick=()=>{bulkEntries.splice(index,1);renderBulkEntries()};
    head.appendChild(remove);

    ta.rows=3;ta.placeholder='Resposta...';ta.value=entry.answer||'';
    ta.oninput=()=>bulkEntries[index].answer=ta.value;

    body.append(head,ta);
    item.append(media,body);
    els.bulkItems.appendChild(item);
  });
}

els.bulkToggle.onclick=()=>setBulkMode(!bulkMode);

els.bulkImageInput.onchange=async()=>{
  const files=[...els.bulkImageInput.files];els.bulkImageInput.value='';
  for(const file of files)bulkEntries.push({type:'image',image:await imageToDataURL(file),svg:null,answer:''});
  renderBulkEntries();
};

els.openBulkSvgBtn.onclick=()=>els.bulkSvgBox.classList.remove('hidden');
els.cancelBulkSvgBtn.onclick=()=>els.bulkSvgBox.classList.add('hidden');
els.addBulkSvgBtn.onclick=()=>{
  try{
    const svgs=extractSvgs(els.bulkSvgInput.value);
    svgs.forEach(svg=>bulkEntries.push({type:'svg',svg,image:null,answer:''}));
    els.bulkSvgInput.value='';
    renderBulkEntries();
  }catch(e){toast('SVG inválido.')}
};

els.form.onsubmit=async e=>{
  e.preventDefault();

  const question=els.question.value.trim(),id=Number(els.editId.value);
  if(!question)return toast('Preencha a pergunta.');

  if(bulkMode&&!id){
    if(!bulkEntries.length)return toast('Adicione imagens ou SVGs.');
    if(bulkEntries.some(x=>!x.answer.trim()))return toast('Preencha todas as respostas.');

    const t=now();

    await dbBulkAdd(bulkEntries.map(x=>({
      question,answer:x.answer.trim(),image:x.type==='image'?x.image:null,svg:x.type==='svg'?x.svg:null,
      createdAt:t,updatedAt:t,reviews:0,lapses:0,ease:2.3,interval:0,nextReview:0,lastReviewed:null
    })));
  }else{
    const answer=els.answer.value.trim();
    if(!answer)return toast('Preencha a resposta.');

    let image=null,svg=null;

    if(singleMediaMode==='image')image=editingImage;
    else if(els.svgInput.value.trim())svg=sanitizeSvg(els.svgInput.value);

    if(id){
      const old=cards.find(c=>c.id===id);
      await dbPut({...old,question,answer,image,svg,updatedAt:now()});
    }else{
      await dbAdd({question,answer,image,svg,createdAt:now(),updatedAt:now(),reviews:0,lapses:0,ease:2.3,interval:0,nextReview:0,lastReviewed:null});
    }
  }

  closeEditor();
  await loadCards();
  toast('Salvo.');
};

els.imageInput.onchange=async()=>{
  const file=els.imageInput.files[0];
  if(file){editingImage=await imageToDataURL(file);updateImagePreview()}
};

els.removeImage.onclick=()=>{editingImage=null;updateImagePreview()};
els.newBtn.onclick=()=>openEditor();
els.emptyNewBtn.onclick=()=>openEditor();
els.closeEditor.onclick=closeEditor;
els.cancelBtn.onclick=closeEditor;
els.search.oninput=render;

async function removeCard(id){
  if(!confirm('Excluir este flashcard?'))return;
  await dbDelete(id);
  await loadCards();
}

/* ESTUDO */

function startStudy(){
  if(!cards.length)return toast('Não há flashcards.');

  let due=cards.filter(isDue);
  if(!due.length)due=[...cards];

  studyQueue=due.map(c=>c.id);
  if(shuffled)shuffle(studyQueue);

  sessionTotal=studyQueue.length;sessionDone=new Set();
  els.studyView.classList.add('active');
  document.body.style.overflow='hidden';

  nextStudyCard();
}

function nextStudyCard(){
  if(!studyQueue.length)return finishStudy();

  studyCurrent=cards.find(c=>c.id===studyQueue.shift());
  if(!studyCurrent)return nextStudyCard();

  els.studyQuestion.textContent=studyCurrent.question;
  els.studyAnswer.textContent=studyCurrent.answer;

  const media=cardMedia(studyCurrent);
  els.studyImage.classList.toggle('hidden',!media);
  if(media)els.studyImage.src=media;

  els.answerArea.classList.add('hidden');
  els.ratingArea.classList.add('hidden');
  els.showAnswer.classList.remove('hidden');

  updateStudyProgress();
}

function revealAnswer(){
  els.answerArea.classList.remove('hidden');
  els.ratingArea.classList.remove('hidden');
  els.showAnswer.classList.add('hidden');
}

function updateStudyProgress(){
  const done=sessionDone.size;
  els.studyProgressText.textContent=`${Math.min(done+1,sessionTotal)} de ${sessionTotal}`;
  els.studyDueText.textContent=`${done} concluídos`;
  els.studyProgressBar.style.width=`${sessionTotal?done/sessionTotal*100:0}%`;
}

async function rateCard(rating){
  if(!studyCurrent)return;

  const c={...studyCurrent},t=now(),reviews=c.reviews||0,ease=c.ease||2.3,interval=c.interval||0;
  c.reviews=reviews+1;c.lastReviewed=t;

  if(rating==='again'){
    c.lapses=(c.lapses||0)+1;c.ease=Math.max(1.3,ease-.2);c.interval=0;c.nextReview=t+10*MINUTE;studyQueue.push(c.id);
  }else if(rating==='hard'){
    c.ease=Math.max(1.3,ease-.15);c.interval=Math.max(1,interval?Math.round(interval*1.25):1);c.nextReview=t+c.interval*DAY;sessionDone.add(c.id);
  }else if(rating==='good'){
    c.ease=Math.min(3.2,ease+.05);c.interval=reviews===0?1:reviews===1?3:Math.max(2,Math.round(Math.max(1,interval)*c.ease));c.nextReview=t+c.interval*DAY;sessionDone.add(c.id);
  }else{
    c.ease=Math.min(3.4,ease+.12);c.interval=reviews===0?4:reviews===1?7:Math.max(4,Math.round(Math.max(1,interval)*c.ease*1.5));c.nextReview=t+c.interval*DAY;sessionDone.add(c.id);
  }

  await dbPut(c);

  const i=cards.findIndex(x=>x.id===c.id);
  if(i>=0)cards[i]=c;

  nextStudyCard();
}

function finishStudy(){
  closeStudy();
  render();
  toast('Sessão concluída!');
}

function closeStudy(){
  els.studyView.classList.remove('active');
  document.body.style.overflow='';
  studyQueue=[];studyCurrent=null;
}

els.studyBtn.onclick=startStudy;
els.showAnswer.onclick=revealAnswer;
els.exitStudy.onclick=closeStudy;
$$('.rating').forEach(b=>b.onclick=()=>rateCard(b.dataset.rating));

els.shuffleBtn.onclick=()=>{
  shuffled=!shuffled;
  els.shuffleBtn.textContent=shuffled?'✓ Embaralhado':'⇄ Embaralhar';
};

els.fullscreen.onclick=async()=>{
  if(!document.fullscreenElement)await els.studyView.requestFullscreen();
  else await document.exitFullscreen();
};

/* BACKUP */

function download(name,text){
  const blob=new Blob([text],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=name;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

els.exportBtn.onclick=()=>{
  if(!cards.length)return toast('Não há flashcards.');
  download(`flashcards-backup-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify({app:'Flashcards',version:4,cards}));
};

els.importBtn.onclick=()=>els.importInput.click();

els.importInput.onchange=async()=>{
  const file=els.importInput.files[0];els.importInput.value='';
  if(!file)return;

  try{
    const data=JSON.parse(await file.text()),items=Array.isArray(data)?data:data.cards;
    if(!Array.isArray(items))throw new Error();

    const replace=confirm('OK = substituir os atuais\nCancelar = adicionar aos atuais');
    if(replace)await dbClear();

    await dbBulkAdd(items);
    await loadCards();
    toast('Backup importado.');
  }catch(e){toast('Backup inválido.')}
};

/* TEMA / PWA */

function applyTheme(theme){
  document.body.classList.toggle('dark',theme==='dark');
  els.themeBtn.textContent=theme==='dark'?'☀':'☾';
  localStorage.setItem('flashcards_theme',theme);
}

els.themeBtn.onclick=()=>applyTheme(document.body.classList.contains('dark')?'light':'dark');

(async()=>{
  try{
    applyTheme(localStorage.getItem('flashcards_theme')||(matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'));
    await openDB();
    await loadCards();

    if('serviceWorker'in navigator)
      await navigator.serviceWorker.register('./service-worker.js');
  }catch(e){
    console.error(e);
    toast('Erro ao iniciar o app.');
  }
})();
