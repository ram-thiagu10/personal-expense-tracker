/* Global supabase is loaded from the official browser CDN in index.html. */
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const configured = window.SUPABASE_URL?.startsWith('https://') && window.SUPABASE_ANON_KEY && !window.SUPABASE_ANON_KEY.includes('YOUR_');
const sb = configured ? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY, {
  auth: {autoRefreshToken:true,detectSessionInUrl:true,persistSession:true}
}) : null;
let household = null, categories = [], expenses = [], householdMembers = [], currentUserId = null, owner = 'common', activePeriod = 'month';
const money = n => new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(n || 0);
const today = () => new Date().toISOString().slice(0,10);
const esc = s => String(s || '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),3000)}
function showAppError(message){let box=$('#authError');if(!box){box=document.createElement('p');box.id='authError';box.className='app-error';$('#setup .setup-card').append(box);}box.textContent=message;box.hidden=false;}
function clearAppError(){const box=$('#authError');if(box)box.hidden=true;}
function fail(e){const message=e?.message || 'Something went wrong. Please try again.';showAppError(message);toast(message);}
function showSignIn(){
  household=null;categories=[];expenses=[];householdMembers=[];currentUserId=null;$('#app').hidden=true;$('#setup').hidden=false;
  $('#authPanel').hidden=false;$('#householdPanel').hidden=true;$('#authPassword').value='';
}
async function signOut(){
  const button=$('#signOut');button.disabled=true;
  const {error}=await sb.auth.signOut({scope:'local'});
  button.disabled=false;
  if(error){toast(`Sign out failed: ${error.message}`);return;}
  showSignIn();toast('Signed out.');
}
function isDeletedUserSessionError(error){return error?.message?.includes('User from sub claim in JWT does not exist');}
async function showSignInForDeletedUser(){
  const {error}=await sb.auth.signOut({scope:'local'});
  if(error)console.error('Could not clear the deleted user session:',error);
  showSignIn();
  showAppError('This account was deleted. Sign in with an existing account or create a new one.');
}
function dateText(d){return new Date(d+'T12:00').toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}

async function sessionStart(){
  if(!configured){$('#authPanel').innerHTML='<p class="eyebrow">CONFIGURATION NEEDED</p><h1>Connect your database.</h1><p class="setup-copy">Copy <code>config.example.js</code> to <code>config.js</code>, then add your Supabase Project URL and publishable key.</p>';return;}
  const {data:{session}}=await sb.auth.getSession();
  if(session) await loadMembership(); else $('#setup').hidden=false;
  sb.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT')showSignIn();});
}
function showHouseholdSetup(){clearAppError();$('#setup').hidden=false;$('#authPanel').hidden=true;$('#householdPanel').hidden=false;}
function showMembershipError(error){
  $('#setup').hidden=false;$('#authPanel').hidden=true;$('#householdPanel').hidden=true;fail(error);
}
async function openHousehold(data){
  const {data:{user},error:userError}=await sb.auth.getUser();
  if(userError)throw userError;
  if(!user)throw new Error('Sign in again to load household members.');
  const {data:members,error:membersError}=await sb.from('household_members')
    .select('user_id,display_name').eq('household_id',data.id).order('joined_at');
  if(membersError)throw membersError;
  householdMembers=members;
  currentUserId=user.id;
  if(!householdMembers.some(member=>member.user_id===currentUserId)){
    throw new Error('Your household membership is missing. Run supabase/repair-existing-household.sql in Supabase SQL Editor.');
  }
  household=data;owner=currentUserId;$('#householdLabel').textContent=data.name;$('#setup').hidden=true;$('#app').hidden=false;clearAppError();switchView('dashboard');renderOwnerOptions();renderInviteCard();await refresh();
}
async function loadMembership(){
  clearAppError();
  const {data:{user},error:userError}=await sb.auth.getUser();
  if(userError){if(isDeletedUserSessionError(userError))await showSignInForDeletedUser();else showMembershipError(userError);return false;}
  if(!user){$('#setup').hidden=false;$('#authPanel').hidden=false;$('#householdPanel').hidden=true;return false;}
  const loadViaRpc=async(hasMembership=false)=>{
    const {data,error}=await sb.rpc('current_household').maybeSingle();
    if(error){
      showMembershipError(new Error(`Could not load your existing household. Run supabase/fix-membership-loading.sql in Supabase SQL Editor, then refresh. Details: ${error.message}`));
      return false;
    }
    if(data){await openHousehold(data);return true;}
    if(hasMembership){showMembershipError(new Error('Your account has a household membership, but its household lookup returned no result. Run supabase/repair-existing-household.sql in Supabase SQL Editor.'));return false;}
    showHouseholdSetup();return false;
  };
  const {data:ownedHousehold,error:ownedHouseholdError}=await sb.from('households')
    .select('id,name,invite_code').eq('created_by',user.id).maybeSingle();
  if(ownedHouseholdError)return loadViaRpc();
  if(ownedHousehold){await openHousehold(ownedHousehold);return true;}
  const {data:membership,error:membershipError}=await sb.from('household_members')
    .select('household_id').eq('user_id',user.id).limit(1).maybeSingle();
  if(membershipError)return loadViaRpc();
  if(!membership){
    return loadViaRpc();
  }
  const {data:memberHousehold,error:memberHouseholdError}=await sb.from('households')
    .select('id,name,invite_code').eq('id',membership.household_id).maybeSingle();
  if(memberHouseholdError||!memberHousehold)return loadViaRpc(true);
  await openHousehold(memberHousehold);return true;
}
function renderInviteCard(){let card=$('#inviteCard');if(!card){card=document.createElement('div');card.id='inviteCard';card.className='invite-card';$('#settings').append(card);}card.innerHTML=`<div><p class="eyebrow">SHARE WITH YOUR WIFE</p><b>Household invite code</b><code>${esc(household.invite_code)}</code><small>She can use this after creating her own account.</small></div><button class="outline" id="copyInvite">Copy code</button>`;$('#copyInvite').onclick=async()=>{try{await navigator.clipboard.writeText(household.invite_code);toast('Invite code copied.')}catch{toast(`Invite code: ${household.invite_code}`)}};}
async function loadCategories(){const {data,error}=await sb.from('categories').select('*').eq('household_id',household.id).order('name');if(error)throw error;categories=data;
  $('#category').innerHTML='<option value="" disabled selected>Choose a category</option>'+categories.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');
  $('#filterCategory').innerHTML='<option value="">All categories</option>'+categories.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');renderCategorySettings();}
async function loadExpenses(){let q=sb.from('expenses').select('*, categories(name,color)').eq('household_id',household.id).order('expense_date',{ascending:false}).order('id',{ascending:false});
  if($('#filterFrom').value)q=q.gte('expense_date',$('#filterFrom').value);if($('#filterTo').value)q=q.lte('expense_date',$('#filterTo').value);if($('#filterOwnership').value)q=q.eq('ownership',$('#filterOwnership').value);if($('#filterCategory').value)q=q.eq('category_id',$('#filterCategory').value);
  const {data,error}=await q;if(error)throw error;expenses=data.map(e=>({...e,category:e.categories.name,category_color:e.categories.color}));renderLists();}
function memberForExpense(person){return householdMembers.find(member=>member.display_name===person)||(person==='You'?householdMembers.find(member=>member.user_id===currentUserId):person==='Wife'?householdMembers.find(member=>member.user_id!==currentUserId):null);}
function expenseRow(e){const member=e.ownership==='personal'?memberForExpense(e.person):null,who=e.ownership==='common'?'Shared':member?.display_name||e.person;return `<div class="expense-row"><div class="avatar">${who==='Shared'?'⌂':esc(who[0]||'?')}</div><div class="expense-info"><b>${esc(e.category)}</b><small>${esc(e.note)||'No note'}</small></div><span class="expense-date">${dateText(e.expense_date)}</span><span class="expense-type tag">${esc(who)}</span><strong class="amount">${money(e.amount)}</strong><span class="row-actions"><button onclick="editExpense(${e.id})" title="Edit">✎</button><button onclick="deleteExpense(${e.id})" title="Delete">×</button></span></div>`}
function renderLists(){const all=$('#allExpenses'),recent=$('#recentList');all.innerHTML=expenses.length?expenses.map(expenseRow).join(''):'<div class="empty" style="height:150px">No expenses match these filters.</div>';recent.innerHTML=expenses.slice(0,5).length?expenses.slice(0,5).map(expenseRow).join(''):'<div class="empty" style="height:120px">Start by adding your first expense.</div>';}
async function dashboardData(){let q=sb.from('expenses').select('*, categories(name,color)').eq('household_id',household.id);const {data,error}=await q;if(error)throw error;let rows=data.map(e=>({...e,category:e.categories.name,category_color:e.categories.color}));const now=new Date(), start=new Date(now), end=new Date(now);if($('#rangeFrom').value&&$('#rangeTo').value){start.setTime(new Date($('#rangeFrom').value+'T12:00'));end.setTime(new Date($('#rangeTo').value+'T12:00'));}else if(activePeriod==='week')start.setDate(now.getDate()-now.getDay()+1);else if(activePeriod==='month')start.setDate(1);else start.setMonth(0,1);start.setHours(0,0,0,0);end.setHours(23,59,59,999);const included=rows.filter(e=>{const d=new Date(e.expense_date+'T12:00');return d>=start&&d<=end});return {start,end,rows:included};}
async function loadDashboard(){const d=await dashboardData();let sums={common:0},total=0,byDate={},byCategory={};householdMembers.forEach(member=>sums[member.display_name]=0);d.rows.forEach(e=>{total+=+e.amount;const member=e.ownership==='personal'?memberForExpense(e.person):null,key=e.ownership==='common'?'common':member?.display_name||e.person;sums[key]=(sums[key]||0)+ +e.amount;byDate[e.expense_date]=(byDate[e.expense_date]||0)+ +e.amount;let c=byCategory[e.category]||{name:e.category,color:e.category_color,total:0,count:0};c.total+=+e.amount;c.count+=1;byCategory[e.category]=c});$('#total').textContent=money(total);$('#rangeLabel').textContent=`${d.start.toLocaleDateString('en-IN',{day:'numeric',month:'short'})} – ${d.end.toLocaleDateString('en-IN',{day:'numeric',month:'short'})}`;renderStats(sums,total);const trend=Object.entries(byDate).sort(([a],[b])=>a.localeCompare(b));const max=Math.max(...trend.map(([,v])=>v),1);$('#trendChart').classList.toggle('empty',!trend.length);$('#trendChart').innerHTML=trend.length?trend.map(([date,value])=>`<div class="bar" style="height:${Math.max(7,value/max*100)}%" data-label="${date}: ${money(value)}"></div>`).join(''):'No expenses in this period yet.';const cats=Object.values(byCategory).sort((a,b)=>b.total-a.total),cmax=Math.max(...cats.map(x=>x.total),1);$('#categoryChart').classList.toggle('empty',!cats.length);$('#categoryChart').innerHTML=cats.length?cats.slice(0,6).map(x=>`<div class="category-row"><i class="dot" style="background:${x.color}"></i><span>${esc(x.name)}</span><strong>${money(x.total)}</strong><div class="track"><div class="fill" style="background:${x.color};width:${x.total/cmax*100}%"></div></div></div>`).join(''):'No categories to show yet.';renderAnalysisCharts(d.rows,total,cats);}
function ensureAnalysisPanels(){let grid=$('#analysisCharts');if(grid)return grid;grid=document.createElement('div');grid.id='analysisCharts';grid.className='analysis-grid';grid.innerHTML='<section class="panel analysis-panel"><div class="panel-head"><div><h2>Spending by person</h2><p>Share of total and expense count</p></div></div><div id="personDonut" class="person-donut"></div><div id="personLegend" class="analysis-legend"></div></section><section class="panel analysis-panel"><div class="panel-head"><div><h2>Expense count by category</h2><p>Number of transactions in this period</p></div></div><div id="categoryCounts" class="category-counts"></div></section>';$('#dashboard .dash-grid').after(grid);return grid;}
function renderAnalysisCharts(rows,total,categoriesBySpend){ensureAnalysisPanels();const palette=['#5b5ce2','#14b8a6','#f59e0b','#fb7185','#3b82f6','#a855f7','#22c55e','#64748b'];const people=new Map([['Shared',{amount:0,count:0}]]);householdMembers.forEach(member=>people.set(member.display_name,{amount:0,count:0}));rows.forEach(expense=>{const member=expense.ownership==='personal'?memberForExpense(expense.person):null,label=expense.ownership==='common'?'Shared':member?.display_name||expense.person;const entry=people.get(label)||{amount:0,count:0};entry.amount+=Number(expense.amount);entry.count+=1;people.set(label,entry);});const slices=[...people].filter(([,value])=>value.amount>0);let angle=0;const segments=slices.map(([label,value],index)=>{const start=angle;angle+=total?value.amount/total*360:0;return `${palette[index%palette.length]} ${start}deg ${angle}deg`;});const donut=$('#personDonut');donut.classList.toggle('empty',!slices.length);donut.style.background=slices.length?`conic-gradient(${segments.join(',')})`:'';donut.innerHTML=slices.length?`<div class="donut-hole"><strong>${money(total)}</strong><span>Total spend</span></div>`:'No expenses in this period yet.';const legend=$('#personLegend');legend.replaceChildren();slices.forEach(([label,value],index)=>{const row=document.createElement('div'),name=document.createElement('span'),metrics=document.createElement('strong'),dot=document.createElement('i');row.className='legend-row';dot.className='dot';dot.style.backgroundColor=palette[index%palette.length];name.textContent=label;metrics.textContent=`${money(value.amount)} · ${value.count} ${value.count===1?'expense':'expenses'}`;row.append(dot,name,metrics);legend.append(row);});const countRows=categoriesBySpend.filter(category=>category.count>0).sort((a,b)=>b.count-a.count).slice(0,8),maxCount=Math.max(...countRows.map(category=>category.count),1),counts=$('#categoryCounts');counts.replaceChildren();if(!countRows.length){counts.classList.add('empty');counts.textContent='No expenses in this period yet.';return;}counts.classList.remove('empty');countRows.forEach(category=>{const row=document.createElement('div'),label=document.createElement('span'),count=document.createElement('strong'),track=document.createElement('div'),fill=document.createElement('div');row.className='count-row';label.textContent=category.name;count.textContent=String(category.count);track.className='count-track';fill.className='count-fill';fill.style.width=`${category.count/maxCount*100}%`;fill.style.backgroundColor=category.color;track.append(fill);row.append(label,count,track);counts.append(row);});}
function renderStats(sums,total){const stats=$('.stats');stats.replaceChildren();const addStat=(label,value,detail='',ids={})=>{const card=document.createElement('article'),title=document.createElement('span'),amount=document.createElement('strong');title.textContent=label;amount.textContent=money(value);if(ids.amount)amount.id=ids.amount;card.append(title,amount);if(detail){const caption=document.createElement('small');caption.textContent=detail;if(ids.detail)caption.id=ids.detail;card.append(caption);}stats.append(card);};addStat('Spending in period',total,$('#rangeLabel')?.textContent||'—',{amount:'total',detail:'rangeLabel'});addStat('Shared costs',sums.common,'Things you share');householdMembers.forEach(member=>{const isCurrent=member.user_id===currentUserId;addStat(isCurrent?`Your personal (${member.display_name})`:`${member.display_name}'s personal`,sums[member.display_name]||0);});}
function renderCategorySettings(){$('#categorySettings').innerHTML=categories.map(c=>`<article class="category-card"><i class="dot" style="background:${c.color}"></i><b>${esc(c.name)}</b><button onclick="editCategory(${c.id})" title="Edit">✎</button><button onclick="deleteCategory(${c.id})" title="Remove">×</button></article>`).join('')||'<p>No categories yet.</p>'}
async function refresh(){try{await loadCategories();await Promise.all([loadExpenses(),loadDashboard()]);}catch(e){fail(e)}}
function renderOwnerOptions(){const options=$('.segmented div');options.replaceChildren();[['common','Shared'],...householdMembers.map(member=>[member.user_id,member.user_id===currentUserId?`You (${member.display_name})`:member.display_name])].forEach(([value,label])=>{const button=document.createElement('button');button.type='button';button.className='owner';button.dataset.owner=value;button.textContent=label;button.onclick=()=>setOwner(value);options.append(button);});setOwner(owner);}
function setOwner(value){owner=value;$$('.segmented .owner').forEach(b=>b.classList.toggle('active',b.dataset.owner===value));}
function showExpense(e=null){$('#expenseForm').reset();$('#expenseId').value=e?.id||'';$('#expenseDialogTitle').textContent=e?'Edit an expense':'Add an expense';$('#expenseDate').value=e?.expense_date||today();$('#amount').value=e?.amount||'';$('#note').value=e?.note||'';$('#category').value=e?.category_id||'';const matchedMember=e?memberForExpense(e.person):null;setOwner(e?(e.ownership==='common'?'common':matchedMember?.user_id||currentUserId):currentUserId);$('#expenseDialog').showModal();}
function showCategory(c=null){$('#categoryForm').reset();$('#categoryId').value=c?.id||'';$('#categoryName').value=c?.name||'';$('#categoryColor').value=c?.color||'#5B6CFF';$('#categoryDialogTitle').textContent=c?'Edit category':'New category';$('#categoryDialog').showModal();}
window.editExpense=id=>showExpense(expenses.find(e=>e.id===id));window.deleteExpense=async id=>{if(confirm('Remove this expense?')){const {error}=await sb.from('expenses').delete().eq('id',id).eq('household_id',household.id);if(error)return fail(error);toast('Expense removed');refresh();}};
window.editCategory=id=>showCategory(categories.find(c=>c.id===id));window.deleteCategory=async id=>{if(confirm('Remove this category?')){const {error}=await sb.from('categories').delete().eq('id',id).eq('household_id',household.id);if(error)return fail(error.message.includes('foreign key')?'Categories in use cannot be removed.':error);toast('Category removed');refresh();}};

$('#authForm').onsubmit=async e=>{e.preventDefault();const button=$('#signIn');button.disabled=true;button.textContent='Signing in…';clearAppError();try{const {error}=await sb.auth.signInWithPassword({email:$('#authEmail').value.trim(),password:$('#authPassword').value});if(error)throw error;showHouseholdSetup();await loadMembership();}catch(error){$('#authPanel').hidden=false;$('#householdPanel').hidden=true;fail(error)}finally{button.disabled=false;button.textContent='Sign in';}};
$('#signUp').onclick=async()=>{const email=$('#authEmail').value.trim(),password=$('#authPassword').value;if(!email||!password)return toast('Enter an email and password first.');const {data,error}=await sb.auth.signUp({email,password,options:{emailRedirectTo:window.location.origin+window.location.pathname}});if(error)return fail(error);if(data.session){await loadMembership();toast('Account created.');}else toast('Check your email to confirm your account, then sign in.');};
$('#createHousehold').onclick=()=>{$('#setupChoices').hidden=true;$('#createForm').hidden=false;$('#joinForm').hidden=true};$('#joinHousehold').onclick=()=>{$('#setupChoices').hidden=true;$('#joinForm').hidden=false;$('#createForm').hidden=true};
$('#backFromCreate').onclick=()=>{$('#createForm').hidden=true;$('#setupChoices').hidden=false};$('#backFromJoin').onclick=()=>{$('#joinForm').hidden=true;$('#setupChoices').hidden=false};
$('#createForm').onsubmit=async e=>{e.preventDefault();const {data,error}=await sb.rpc('create_household',{household_name:$('#householdName').value.trim(),member_name:$('#createMemberName').value.trim()});if(error){if(error.message?.includes('already belong to a household')){if(await loadMembership())return;return fail(new Error('Your account already has a household membership, but it could not be loaded. Check that the app is connected to the same Supabase project and that household_members and households are readable for your account.'));}return fail(error);}const result=Array.isArray(data)?data[0]:data;if(!result?.household_id||!result?.invite_code)return fail(new Error('Household creation returned no household details.'));await openHousehold({id:result.household_id,name:$('#householdName').value.trim(),invite_code:result.invite_code});toast('Household created. Your invite code is saved in Categories.');};
$('#joinForm').onsubmit=async e=>{e.preventDefault();const {error}=await sb.rpc('join_household',{code:$('#inviteCode').value,member_name:$('#joinMemberName').value});if(error)return fail(error);toast('Joined household.');await loadMembership();};
$('#signOut').onclick=signOut;$('#newExpense').onclick=()=>showExpense();$('#newCategory').onclick=()=>showCategory();$('#quickCategory').onclick=()=>showCategory();$$('.close').forEach(b=>b.onclick=()=>b.closest('dialog').close());$$('.owner').forEach(b=>b.onclick=()=>setOwner(b.dataset.owner));
$('#expenseForm').onsubmit=async e=>{e.preventDefault();const id=$('#expenseId').value,selectedMember=householdMembers.find(member=>member.user_id===owner);if(owner!=='common'&&!selectedMember)return fail(new Error('Choose a household member for this personal expense.'));const payload={household_id:household.id,amount:+$('#amount').value,category_id:+$('#category').value,expense_date:$('#expenseDate').value,ownership:owner==='common'?'common':'personal',person:owner==='common'?null:selectedMember.display_name,note:$('#note').value.trim(),updated_at:new Date().toISOString()};const q=id?sb.from('expenses').update(payload).eq('id',id).eq('household_id',household.id):sb.from('expenses').insert(payload);const {error}=await q;if(error)return fail(error);$('#expenseDialog').close();toast(id?'Expense updated':'Expense saved');refresh();};
$('#categoryForm').onsubmit=async e=>{e.preventDefault();const id=$('#categoryId').value,payload={household_id:household.id,name:$('#categoryName').value.trim(),color:$('#categoryColor').value};const {data,error}=id?await sb.from('categories').update(payload).eq('id',id).eq('household_id',household.id).select().single():await sb.from('categories').insert(payload).select().single();if(error)return fail(error);$('#categoryDialog').close();await loadCategories();if(!id&&$('#expenseDialog').open)$('#category').value=data.id;toast(id?'Category updated':'Category added');};
$$('.nav').forEach(b=>b.onclick=()=>switchView(b.dataset.view));$$('[data-switch]').forEach(b=>b.onclick=()=>switchView(b.dataset.switch));function switchView(v){$$('.view,.nav').forEach(x=>x.classList.toggle('active',x.id===v||x.dataset.view===v));$('#pageTitle').textContent=v==='dashboard'?'A clearer view of your spending.':v==='expenses'?'Every expense, in one place.':'Make the tracker yours.';}
$$('[data-period]').forEach(b=>b.onclick=()=>{activePeriod=b.dataset.period;$$('[data-period]').forEach(x=>x.classList.toggle('selected',x===b));$('#rangeFrom').value='';$('#rangeTo').value='';loadDashboard().catch(fail)});$('#applyRange').onclick=()=>{if($('#rangeFrom').value&&$('#rangeTo').value)loadDashboard().catch(fail);else toast('Choose both dates first.')};['#filterFrom','#filterTo','#filterOwnership','#filterCategory'].forEach(s=>$(s).onchange=()=>loadExpenses().catch(fail));$('#clearFilters').onclick=()=>{$$('.filters input,.filters select').forEach(x=>x.value='');loadExpenses().catch(fail)};$('#export').onclick=()=>{const rows=[['Date','Amount','Category','Type','Person','Note'],...expenses.map(e=>[e.expense_date,e.amount,e.category,e.ownership,e.person||'',e.note])];const csv=rows.map(r=>r.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='household-expenses.csv';a.click();URL.revokeObjectURL(a.href);};
sessionStart().catch(fail);
