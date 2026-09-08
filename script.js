const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];

const els={
  total:$('#totalCount'),due:$('#dueCount'),mastered:$('#masteredCount'),today:$('#todayCount'),
  studyBtn:$('#studyBtn'),shuffleBtn:$('#shuffleBtn'),newBtn:$('#newBtn'),emptyNewBtn:$('#emptyNewBtn'),
  exportBtn:$('#exportBtn'),importBtn:$('#importBtn'),importInput:$('#importInput'),
  editor:$('#editorPanel'),editorTitle:$('#editorTitle'),editorDesc:$('#editorDesc'),bulkToggle:$('#bulkToggle'),
  form:$('#cardForm'),editId:$('#editId'),question:$('#question'),
  singleAnswerField:$('#singleAnswerField'),answer:$('#answer'),
  singleImageField:$('#singleImageField'),imageInput:$('#imageInput'),imagePreviewWrap:$('#imagePreviewWrap'),
  imagePreview:$('#imagePreview'),removeImage:$('#removeImageBtn'),
  bulkArea:$('#bulkArea'),bulkImageInput:$('#bulkImageInput'),bulkItems:$('#bulkItems'),bulkCount:$('#bulkCount'),
  closeEditor:$('#closeEditorBtn'),cancelBtn:$('#cancelBtn'),search:$('#searchInput'),
  list:$('#cardList'),empty:$('#emptyState'),listSubtitle:$('#listSubtitle'),
  studyView:$('#studyView'),exitStudy:$('#exitStudyBtn'),fullscreen:$('#fullscreenBtn'),
  studyProgressText:$('#studyProgressText'),studyDueText:$('#studyDueText'),studyProgressBar:$('#studyProgressBar'),
  studyQuestion:$('#studyQuestion'),studyImage:$('#studyImage'),showAnswer:$('#showAnswerBtn'),
  answerArea:$('#answerArea'),studyAnswer:$('#studyAnswer'),ratingArea:$('#ratingArea'),
  toast:$('#toast'),themeBtn:$('#themeBtn')
};

const DB_NAME='flashcards_app',STORE='cards',DAY=86400000,MINUTE=60000;

let db,cards=[],editingImage=null,bulkMode=false,bulkEntries=[],
studyQueue=[],studyCurrent=null,sessionTotal=0,sessionDone=new Set(),
shuffled=false,toastTimer;


function openDB(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,1);

    req.onupgradeneeded=e=>{
      const d=e.target.result;

      if(!d.objectStoreNames.contains(STORE))
        d.createObjectStore(STORE,{keyPath:'id',autoIncrement:true});
    };

    req.onsuccess=()=>{db=req.result;resolve()};
    req.onerror=()=>reject(req.error);
  });
}


function tx(mode='readonly'){
  return db.transaction(STORE,mode).objectStore(STORE);
}


function dbGetAll(){
  return new Promise((res,rej)=>{
    const r=tx().getAll();

    r.onsuccess=()=>res(r.result);
    r.onerror=()=>rej(r.error);
  });
}


function dbAdd(card){
  return new Promise((res,rej)=>{
    const r=tx('readwrite').add(card);

    r.onsuccess=()=>res(r.result);
    r.onerror=()=>rej(r.error);
  });
}


function dbPut(card){
  return new Promise((res,rej)=>{
    const r=tx('readwrite').put(card);

    r.onsuccess=()=>res();
    r.onerror=()=>rej(r.error);
  });
}


function dbDelete(id){
  return new Promise((res,rej)=>{
    const r=tx('readwrite').delete(id);

    r.onsuccess=()=>res();
    r.onerror=()=>rej(r.error);
  });
}


function dbClear(){
  return new Promise((res,rej)=>{
    const r=tx('readwrite').clear();

    r.onsuccess=()=>res();
    r.onerror=()=>rej(r.error);
  });
}


function dbBulkAdd(items){
  return new Promise((res,rej)=>{
    const t=db.transaction(STORE,'readwrite');
    const s=t.objectStore(STORE);

    items.forEach(c=>{
      const copy={...c};
      delete copy.id;
      s.add(copy);
    });

    t.oncomplete=()=>res();
    t.onerror=()=>rej(t.error);
  });
}


const now=()=>Date.now();

const isDue=c=>!c.nextReview||c.nextReview<=now();

const sameDay=(a,b)=>
  new Date(a).toDateString()===new Date(b).toDateString();


function fmtDate(ts){
  if(!ts||ts<=now())return'Agora';

  const diff=Math.ceil((ts-now())/DAY);

  if(diff===1)return'Amanhã';
  if(diff<7)return`Em ${diff} dias`;

  return new Date(ts).toLocaleDateString('pt-BR',{
    day:'2-digit',
    month:'short'
  });
}


function toast(msg){
  clearTimeout(toastTimer);

  els.toast.textContent=msg;
  els.toast.classList.add('show');

  toastTimer=setTimeout(
    ()=>els.toast.classList.remove('show'),
    2300
  );
}


function shuffle(a){
  for(let i=a.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }

  return a;
}


async function loadCards(){
  cards=await dbGetAll();
  render();
}


function render(){
  const q=els.search.value.trim().toLowerCase();

  const filtered=cards.filter(c=>
    !q||
    c.question.toLowerCase().includes(q)||
    c.answer.toLowerCase().includes(q)
  );

  const due=cards.filter(isDue).length;
  const mastered=cards.filter(c=>(c.interval||0)>=21).length;

  const today=cards.filter(c=>
    c.lastReviewed&&sameDay(c.lastReviewed,Date.now())
  ).length;

  els.total.textContent=cards.length;
  els.due.textContent=due;
  els.mastered.textContent=mastered;
  els.today.textContent=today;

  els.studyBtn.innerHTML=due
    ?`<span>▶</span> Estudar agora <b>${due}</b>`
    :'<span>▶</span> Estudar agora';

  els.listSubtitle.textContent=cards.length
    ?`${cards.length} ${cards.length===1?'cartão cadastrado':'cartões cadastrados'}.`
    :'Nenhum cartão cadastrado.';

  els.list.innerHTML='';

  els.empty.classList.toggle(
    'hidden',
    cards.length>0||q.length>0
  );

  if(!filtered.length&&q){
    const d=document.createElement('div');

    d.className='empty-state';

    d.innerHTML=
      '<div class="empty-visual">⌕</div>'+
      '<h3>Nada encontrado</h3>'+
      '<p>Tente buscar por outro termo.</p>';

    els.list.appendChild(d);

    return;
  }

  filtered.sort(
    (a,b)=>
      (isDue(b)-isDue(a))||
      ((a.nextReview||0)-(b.nextReview||0))
  );

  filtered.forEach(
    c=>els.list.appendChild(cardRow(c))
  );
}


function cardRow(c){
  const row=document.createElement('article');
  row.className='list-card';

  const media=c.image
    ?Object.assign(document.createElement('img'),{
      className:'thumb',
      src:c.image,
      alt:''
    })
    :Object.assign(document.createElement('div'),{
      className:'thumb-placeholder',
      textContent:'✦'
    });

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

  status.className=
    'badge'+(isDue(c)?' due':'');

  status.textContent=isDue(c)
    ?'Revisar agora'
    :`Revisão: ${fmtDate(c.nextReview)}`;

  const rev=document.createElement('span');
  rev.className='badge';
  rev.textContent=`${c.reviews||0} revisões`;

  meta.append(status,rev);
  content.append(q,a,meta);

  const actions=document.createElement('div');
  actions.className='card-actions';

  const edit=document.createElement('button');
  const del=document.createElement('button');

  edit.className='small-btn';
  edit.type='button';
  edit.title='Editar';
  edit.textContent='✎';
  edit.onclick=()=>openEditor(c.id);

  del.className='small-btn delete';
  del.type='button';
  del.title='Excluir';
  del.textContent='⌫';
  del.onclick=()=>removeCard(c.id);

  actions.append(edit,del);

  row.append(media,content,actions);

  return row;
}


/* ===========================
   EDITOR / MODO LOTE
=========================== */


function setBulkMode(on){
  bulkMode=on;

  els.bulkToggle.classList.toggle(
    'active-toggle',
    on
  );

  els.bulkToggle.textContent=on
    ?'✓ Modo lote ativado'
    :'▦ Modo lote por imagens';

  els.singleAnswerField.classList.toggle(
    'hidden',
    on
  );

  els.singleImageField.classList.toggle(
    'hidden',
    on
  );

  els.bulkArea.classList.toggle(
    'hidden',
    !on
  );

  els.answer.required=!on;

  if(!on){
    bulkEntries=[];
    renderBulkEntries();
  }

  els.editorDesc.textContent=on
    ?'Escolha várias imagens, use a mesma pergunta e escreva uma resposta diferente para cada uma.'
    :'Crie a pergunta, resposta e adicione uma imagem se quiser.';
}


function openEditor(id=null){
  els.editor.classList.remove('hidden');

  els.editor.scrollIntoView({
    behavior:'smooth',
    block:'start'
  });

  els.form.reset();

  els.editId.value='';
  editingImage=null;
  bulkEntries=[];

  setBulkMode(false);

  updateImagePreview();

  els.bulkToggle.classList.remove('hidden');

  if(id){
    const c=cards.find(x=>x.id===id);

    if(!c)return;

    els.editorTitle.textContent=
      'Editar flashcard';

    els.editorDesc.textContent=
      'Altere a pergunta, resposta ou imagem deste cartão.';

    els.bulkToggle.classList.add('hidden');

    els.editId.value=c.id;
    els.question.value=c.question;
    els.answer.value=c.answer;

    editingImage=c.image||null;

    updateImagePreview();
  }

  else{
    els.editorTitle.textContent=
      'Novo flashcard';
  }

  setTimeout(
    ()=>els.question.focus(),
    250
  );
}


function closeEditor(){
  els.editor.classList.add('hidden');

  els.form.reset();

  els.editId.value='';

  editingImage=null;
  bulkEntries=[];

  setBulkMode(false);

  updateImagePreview();
}


function updateImagePreview(){
  const has=!!editingImage;

  els.imagePreviewWrap.classList.toggle(
    'hidden',
    !has
  );

  els.removeImage.classList.toggle(
    'hidden',
    !has
  );

  if(has)
    els.imagePreview.src=editingImage;
  else
    els.imagePreview.removeAttribute('src');
}


async function imageToDataURL(
  file,
  max=1600,
  quality=.82
){
  if(!file.type.startsWith('image/'))
    throw new Error('Arquivo inválido');

  const url=URL.createObjectURL(file);

  try{
    const img=await new Promise((res,rej)=>{
      const im=new Image;

      im.onload=()=>res(im);
      im.onerror=rej;
      im.src=url;
    });

    let {width,height}=img;

    if(width>max||height>max){
      const scale=Math.min(
        max/width,
        max/height
      );

      width=Math.round(width*scale);
      height=Math.round(height*scale);
    }

    const canvas=document.createElement('canvas');

    canvas.width=width;
    canvas.height=height;

    canvas
      .getContext('2d')
      .drawImage(img,0,0,width,height);

    return canvas.toDataURL(
      'image/jpeg',
      quality
    );
  }

  finally{
    URL.revokeObjectURL(url);
  }
}


function renderBulkEntries(){
  els.bulkItems.innerHTML='';

  els.bulkCount.textContent=
    bulkEntries.length
      ?`${bulkEntries.length} ${
        bulkEntries.length===1
          ?'imagem selecionada'
          :'imagens selecionadas'
      }`
      :'Nenhuma imagem selecionada';


  bulkEntries.forEach((entry,index)=>{

    const item=document.createElement('article');
    item.className='bulk-item';


    const img=document.createElement('img');

    img.src=entry.image;
    img.alt=`Imagem ${index+1}`;


    const body=document.createElement('div');
    body.className='bulk-item-body';


    const head=document.createElement('div');
    head.className='bulk-item-head';


    const title=document.createElement('strong');

    title.textContent=
      `Flashcard ${index+1}`;


    const remove=document.createElement('button');

    remove.type='button';
    remove.className='small-btn delete';
    remove.title='Remover imagem';
    remove.textContent='×';

    remove.onclick=()=>{
      bulkEntries.splice(index,1);
      renderBulkEntries();
    };


    head.append(
      title,
      remove
    );


    const ta=document.createElement('textarea');

    ta.rows=3;

    ta.placeholder=
      'Resposta para esta imagem...';

    ta.value=
      entry.answer||'';


    ta.addEventListener(
      'input',
      ()=>bulkEntries[index].answer=ta.value
    );


    body.append(
      head,
      ta
    );


    item.append(
      img,
      body
    );


    els.bulkItems.appendChild(item);
  });
}


els.bulkToggle.onclick=()=>{
  if(els.editId.value)return;

  setBulkMode(!bulkMode);
};


els.bulkImageInput.addEventListener(
  'change',
  async()=>{

    const files=[
      ...els.bulkImageInput.files
    ];

    els.bulkImageInput.value='';

    if(!files.length)return;


    try{
      toast(
        `Preparando ${files.length} ${
          files.length===1
            ?'imagem'
            :'imagens'
        }...`
      );


      for(const file of files){

        if(!file.type.startsWith('image/'))
          continue;


        const image=
          await imageToDataURL(file);


        bulkEntries.push({
          image,
          answer:'',
          name:file.name
        });
      }


      renderBulkEntries();


      toast(
        `${files.length} ${
          files.length===1
            ?'imagem adicionada'
            :'imagens adicionadas'
        }.`
      );
    }

    catch(e){
      console.error(e);

      toast(
        'Não consegui processar uma das imagens.'
      );
    }
  }
);


els.form.addEventListener(
  'submit',
  async e=>{

    e.preventDefault();


    const question=
      els.question.value.trim();

    const id=
      Number(els.editId.value);


    if(!question)
      return toast(
        'Preencha a pergunta.'
      );


    try{

      /* MODO LOTE */

      if(bulkMode&&!id){

        if(!bulkEntries.length)
          return toast(
            'Adicione pelo menos uma imagem.'
          );


        if(
          bulkEntries.some(
            x=>!x.answer.trim()
          )
        )
          return toast(
            'Preencha a resposta de todas as imagens.'
          );


        const t=now();


        const items=
          bulkEntries.map(x=>({

            question,

            answer:
              x.answer.trim(),

            image:
              x.image,

            createdAt:t,

            updatedAt:t,

            reviews:0,

            lapses:0,

            ease:2.3,

            interval:0,

            nextReview:0,

            lastReviewed:null

          }));


        await dbBulkAdd(items);


        toast(
          `${items.length} ${
            items.length===1
              ?'flashcard criado'
              :'flashcards criados'
          }.`
        );
      }


      /* MODO NORMAL */

      else{

        const answer=
          els.answer.value.trim();


        if(!answer)
          return toast(
            'Preencha a resposta.'
          );


        if(id){

          const old=
            cards.find(c=>c.id===id);


          await dbPut({
            ...old,

            question,

            answer,

            image:
              editingImage,

            updatedAt:
              now()
          });


          toast(
            'Flashcard atualizado.'
          );
        }


        else{

          await dbAdd({

            question,

            answer,

            image:
              editingImage,

            createdAt:
              now(),

            updatedAt:
              now(),

            reviews:0,

            lapses:0,

            ease:2.3,

            interval:0,

            nextReview:0,

            lastReviewed:null

          });


          toast(
            'Flashcard criado.'
          );
        }
      }


      closeEditor();

      await loadCards();
    }

    catch(err){
      console.error(err);

      toast(
        'Não foi possível salvar os flashcards.'
      );
    }
  }
);


els.imageInput.addEventListener(
  'change',
  async()=>{

    const file=
      els.imageInput.files[0];

    if(!file)return;


    try{

      toast(
        'Preparando imagem...'
      );


      editingImage=
        await imageToDataURL(file);


      updateImagePreview();


      toast(
        'Imagem adicionada.'
      );
    }

    catch(e){

      console.error(e);

      toast(
        'Não consegui abrir essa imagem.'
      );
    }

    finally{
      els.imageInput.value='';
    }
  }
);


els.removeImage.onclick=()=>{
  editingImage=null;
  updateImagePreview();
};


els.newBtn.onclick=
  ()=>openEditor();


els.emptyNewBtn.onclick=
  ()=>openEditor();


els.closeEditor.onclick=
  closeEditor;


els.cancelBtn.onclick=
  closeEditor;


els.search.oninput=
  render;


async function removeCard(id){

  const c=
    cards.find(x=>x.id===id);


  if(
    !c||
    !confirm(
      `Excluir o flashcard “${
        c.question.slice(0,80)
      }${
        c.question.length>80
          ?'…'
          :''
      }”?`
    )
  )
    return;


  await dbDelete(id);

  toast(
    'Flashcard excluído.'
  );

  await loadCards();
}


/* ===========================
   MODO DE ESTUDO
=========================== */


function startStudy(){

  if(!cards.length)
    return toast(
      'Crie pelo menos um flashcard primeiro.'
    );


  let due=
    cards.filter(isDue);


  if(!due.length){

    if(
      !confirm(
        'Não há revisões pendentes. Quer estudar todos os cartões mesmo assim?'
      )
    )
      return;


    due=[...cards];
  }


  studyQueue=
    due.map(c=>c.id);


  if(shuffled)
    shuffle(studyQueue);


  sessionTotal=
    studyQueue.length;


  sessionDone=
    new Set();


  els.studyView.classList.add(
    'active'
  );


  els.studyView.setAttribute(
    'aria-hidden',
    'false'
  );


  document.body.style.overflow=
    'hidden';


  nextStudyCard();
}


function nextStudyCard(){

  if(!studyQueue.length)
    return finishStudy();


  const id=
    studyQueue.shift();


  studyCurrent=
    cards.find(c=>c.id===id);


  if(!studyCurrent)
    return nextStudyCard();


  els.studyQuestion.textContent=
    studyCurrent.question;


  els.studyAnswer.textContent=
    studyCurrent.answer;


  els.studyImage.classList.toggle(
    'hidden',
    !studyCurrent.image
  );


  if(studyCurrent.image)
    els.studyImage.src=
      studyCurrent.image;

  else
    els.studyImage.removeAttribute(
      'src'
    );


  els.answerArea.classList.add(
    'hidden'
  );


  els.ratingArea.classList.add(
    'hidden'
  );


  els.showAnswer.classList.remove(
    'hidden'
  );


  updateStudyProgress();


  document
    .querySelector('.study-scroll')
    .scrollTo({
      top:0,
      behavior:'auto'
    });
}


function revealAnswer(){

  if(
    !studyCurrent||
    !els.answerArea.classList.contains('hidden')
  )
    return;


  els.answerArea.classList.remove(
    'hidden'
  );


  els.ratingArea.classList.remove(
    'hidden'
  );


  els.showAnswer.classList.add(
    'hidden'
  );


  requestAnimationFrame(
    ()=>els.answerArea.scrollIntoView({
      behavior:'smooth',
      block:'nearest'
    })
  );
}


function updateStudyProgress(){

  const done=
    sessionDone.size;


  const pct=
    sessionTotal
      ?Math.round(
        done/sessionTotal*100
      )
      :0;


  els.studyProgressText.textContent=
    `${Math.min(done+1,sessionTotal)} de ${sessionTotal}`;


  els.studyDueText.textContent=
    `${done} concluído${done===1?'':'s'}`;


  els.studyProgressBar.style.width=
    `${pct}%`;
}


async function rateCard(rating){

  if(!studyCurrent)return;


  const c={
    ...studyCurrent
  };


  const t=now();

  const prevReviews=
    c.reviews||0;

  const ease=
    c.ease||2.3;

  const interval=
    c.interval||0;


  c.reviews=
    prevReviews+1;


  c.lastReviewed=
    t;


  if(rating==='again'){

    c.lapses=
      (c.lapses||0)+1;

    c.ease=
      Math.max(
        1.3,
        ease-.2
      );

    c.interval=0;

    c.nextReview=
      t+10*MINUTE;

    studyQueue.push(
      c.id
    );
  }


  else if(rating==='hard'){

    c.ease=
      Math.max(
        1.3,
        ease-.15
      );

    c.interval=
      Math.max(
        1,
        interval
          ?Math.round(interval*1.25)
          :1
      );

    c.nextReview=
      t+c.interval*DAY;

    sessionDone.add(
      c.id
    );
  }


  else if(rating==='good'){

    c.ease=
      Math.min(
        3.2,
        ease+.05
      );


    c.interval=
      prevReviews===0
        ?1
        :prevReviews===1
          ?3
          :Math.max(
            2,
            Math.round(
              Math.max(1,interval)*
              c.ease
            )
          );


    c.nextReview=
      t+c.interval*DAY;


    sessionDone.add(
      c.id
    );
  }


  else{

    c.ease=
      Math.min(
        3.4,
        ease+.12
      );


    c.interval=
      prevReviews===0
        ?4
        :prevReviews===1
          ?7
          :Math.max(
            4,
            Math.round(
              Math.max(1,interval)*
              c.ease*
              1.5
            )
          );


    c.nextReview=
      t+c.interval*DAY;


    sessionDone.add(
      c.id
    );
  }


  await dbPut(c);


  const i=
    cards.findIndex(
      x=>x.id===c.id
    );


  if(i>=0)
    cards[i]=c;


  studyCurrent=null;


  nextStudyCard();
}


function finishStudy(){

  studyCurrent=null;


  els.studyProgressBar.style.width=
    '100%';


  els.studyProgressText.textContent=
    `${sessionTotal} de ${sessionTotal}`;


  els.studyDueText.textContent=
    'Sessão concluída';


  setTimeout(
    ()=>{
      closeStudy();
      toast('Sessão concluída!');
      render();
    },
    250
  );
}


function closeStudy(){

  els.studyView.classList.remove(
    'active'
  );


  els.studyView.setAttribute(
    'aria-hidden',
    'true'
  );


  document.body.style.overflow='';


  studyQueue=[];
  studyCurrent=null;


  if(document.fullscreenElement)
    document.exitFullscreen()
      .catch(()=>{});
}


els.studyBtn.onclick=
  startStudy;


els.showAnswer.onclick=
  revealAnswer;


els.exitStudy.onclick=
  closeStudy;


$$('.rating').forEach(
  b=>b.onclick=
    ()=>rateCard(
      b.dataset.rating
    )
);


els.shuffleBtn.onclick=()=>{

  shuffled=!shuffled;


  els.shuffleBtn.classList.toggle(
    'active-toggle',
    shuffled
  );


  els.shuffleBtn.innerHTML=
    shuffled
      ?'✓ Embaralhado'
      :'⇄ Embaralhar';


  toast(
    shuffled
      ?'Ordem aleatória ativada.'
      :'Ordem aleatória desativada.'
  );
};


els.fullscreen.onclick=async()=>{

  try{

    if(!document.fullscreenElement)
      await els.studyView.requestFullscreen();

    else
      await document.exitFullscreen();

  }

  catch(e){

    toast(
      'Tela cheia não está disponível neste navegador.'
    );

  }
};


document.addEventListener(
  'keydown',
  e=>{

    if(
      !els.studyView.classList.contains('active')
    )
      return;


    if(e.code==='Space'){

      e.preventDefault();

      revealAnswer();

      return;
    }


    if(
      !els.ratingArea.classList.contains('hidden')&&
      ['1','2','3','4'].includes(e.key)
    ){

      e.preventDefault();


      rateCard(
        [
          'again',
          'hard',
          'good',
          'easy'
        ][Number(e.key)-1]
      );
    }


    if(
      e.key==='Escape'&&
      !document.fullscreenElement
    )
      closeStudy();
  }
);


/* ===========================
   BACKUP
=========================== */


function download(name,text){

  const blob=
    new Blob(
      [text],
      {type:'application/json'}
    );


  const url=
    URL.createObjectURL(blob);


  const a=
    document.createElement('a');


  a.href=url;
  a.download=name;


  document.body.appendChild(a);


  a.click();
  a.remove();


  setTimeout(
    ()=>URL.revokeObjectURL(url),
    1000
  );
}


els.exportBtn.onclick=()=>{

  if(!cards.length)
    return toast(
      'Não há flashcards para exportar.'
    );


  download(
    `flashcards-backup-${
      new Date()
        .toISOString()
        .slice(0,10)
    }.json`,

    JSON.stringify({
      app:'Flashcards',
      version:1,
      exportedAt:
        new Date().toISOString(),
      cards
    })
  );


  toast(
    'Backup exportado.'
  );
};


els.importBtn.onclick=
  ()=>els.importInput.click();


els.importInput.onchange=async()=>{

  const file=
    els.importInput.files[0];


  els.importInput.value='';


  if(!file)return;


  try{

    const data=
      JSON.parse(
        await file.text()
      );


    const items=
      Array.isArray(data)
        ?data
        :data.cards;


    if(
      !Array.isArray(items)||
      !items.every(
        c=>
          typeof c.question==='string'&&
          typeof c.answer==='string'
      )
    )
      throw new Error(
        'Formato inválido'
      );


    const replace=
      confirm(
        `Backup encontrado com ${
          items.length
        } flashcard${
          items.length===1
            ?''
            :'s'
        }.\n\nOK = substituir os cartões atuais\nCancelar = adicionar aos cartões atuais`
      );


    if(replace)
      await dbClear();


    await dbBulkAdd(

      items.map(c=>({

        question:
          c.question,

        answer:
          c.answer,

        image:
          c.image||null,

        createdAt:
          c.createdAt||now(),

        updatedAt:
          c.updatedAt||now(),

        reviews:
          Number(c.reviews)||0,

        lapses:
          Number(c.lapses)||0,

        ease:
          Number(c.ease)||2.3,

        interval:
          Number(c.interval)||0,

        nextReview:
          Number(c.nextReview)||0,

        lastReviewed:
          c.lastReviewed
            ?Number(c.lastReviewed)
            :null

      }))
    );


    await loadCards();


    toast(
      `${items.length} flashcard${
        items.length===1
          ?' importado'
          :'s importados'
      }.`
    );

  }

  catch(e){

    console.error(e);

    toast(
      'Esse arquivo não parece ser um backup válido.'
    );
  }
};


/* ===========================
   TEMA
=========================== */


function applyTheme(theme){

  document.body.classList.toggle(
    'dark',
    theme==='dark'
  );


  els.themeBtn.textContent=
    theme==='dark'
      ?'☀'
      :'☾';


  localStorage.setItem(
    'flashcards_theme',
    theme
  );
}


els.themeBtn.onclick=()=>
  applyTheme(
    document.body.classList.contains('dark')
      ?'light'
      :'dark'
  );


(async()=>{

  try{

    applyTheme(
      localStorage.getItem(
        'flashcards_theme'
      )||
      (
        matchMedia(
          '(prefers-color-scheme:dark)'
        ).matches
          ?'dark'
          :'light'
      )
    );


    await openDB();

    await loadCards();

  }

  catch(e){

    console.error(e);

    toast(
      'Seu navegador bloqueou o armazenamento local.'
    );
  }

})();