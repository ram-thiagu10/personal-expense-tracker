const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
let categories=[], expenses=[], owner='common', activePeriod='month';
const money=n=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(n||0);
const api=async(path,opts={})=>{const r=await fetch(path,{headers:{'Content-Type':'application/json'},...opts});if(!r.ok){const d=await r.json().catch(()=>({}));throw Error(d.error||'Something went wrong.')}return r.headers.get('content-type')?.includes('json')?r.json():r};
const today=()=>new Date().toISOString().slice(0,10); const esc=s=>String(s||'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
function toast(message){const t=$('#toast');t.textContent=message;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2700)}
async function loadCategories(){categories=await api('/api/categories');const options='<option value="" disabled selected>Choose a category</option>'+categories.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');$('#category').innerHTML=options;$('#filterCategory').innerHTML='<option value="">All categories</option>'+categories.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');renderCategorySettings()}
function renderCategorySettings(){$('#categorySettings').innerHTML=categories.map(c=>`<article class="category-card"><i class="dot" style="background:${c.color}"></i><b>${esc(c.name)}</b><button title="Edit" onclick="editCategory(${c.id})">✎</button><button title="Remove" onclick="deleteCategory(${c.id})">×</button></article>`).join('')||'<p>No categories yet.</p>'}
function expenseRow(e){let who=e.ownership==='common'?'Shared':e.person;return `<div class="expense-row"><div class="avatar">${who==='Shared'?'⌂':who[0]}</div><div class="expense-info"><b>${esc(e.category)}</b><small>${esc(e.note)||'No note'}</small></div><span class="expense-date">${new Date(e.expense_date+'T12:00').toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}</span><span class="expense-type tag">${who}</span><strong class="amount">${money(e.amount)}</strong><span class="row-actions"><button onclick="editExpense(${e.id})" title="Edit">✎</button><button onclick="deleteExpense(${e.id})" title="Delete">×</button></span></div>`}
async function loadExpenses(){let q=new URLSearchParams;[['from','#filterFrom'],['to','#filterTo'],['category','#filterCategory']].forEach(([k,s])=>{if($(s).value)q.set(k,$(s).value)});const ownerFilter=$('#filterOwnership').value;if(ownerFilter.startsWith('person:'))q.set('person',ownerFilter.slice(7));else if(ownerFilter)q.set('ownership',ownerFilter);expenses=await api('/api/expenses?'+q);$('#allExpenses').innerHTML=expenses.length?expenses.map(expenseRow).join(''):'<div class="empty" style="height:150px">No expenses match these filters.</div>';$('#recentList').innerHTML=expenses.slice(0,5).length?expenses.slice(0,5).map(expenseRow).join(''):'<div class="empty" style="height:120px">Start by adding your first expense.</div>'}
function currentBudgetMonth(){const now=new Date();return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`}
function ensureBudgetPanel(){
  let panel=$('#budgetPanel');if(panel)return panel;
  panel=document.createElement('section');panel.id='budgetPanel';panel.className='panel budget-panel';
  panel.innerHTML='<div class="panel-head"><div><h2>Monthly budgets</h2><p id="budgetMonth">This month</p></div></div><div id="budgetRows" class="budget-rows"></div>';
  $('.period-bar').after(panel);
  panel.addEventListener('submit',async event=>{
    const form=event.target.closest('.budget-form');if(!form)return;
    event.preventDefault();const input=form.querySelector('input'),button=form.querySelector('button'),amount=Number(input.value);
    if(!input.reportValidity()||!Number.isFinite(amount)||amount<=0)return;
    button.disabled=true;
    try{await api('/api/budget',{method:'POST',body:JSON.stringify({month:currentBudgetMonth(),owner:form.dataset.owner,amount})});await loadDashboard();toast('Monthly budget saved')}
    catch(error){toast(error.message)}
    finally{button.disabled=false}
  });
  return panel;
}
function createBudgetRow(owner,label,budget,spent){
  const row=document.createElement('article'),form=document.createElement('form'),heading=document.createElement('div'),name=document.createElement('h3'),formLabel=document.createElement('label'),inputRow=document.createElement('div'),currency=document.createElement('span'),input=document.createElement('input'),button=document.createElement('button'),metrics=document.createElement('div'),budgetMetric=document.createElement('div'),spentMetric=document.createElement('div'),remainingMetric=document.createElement('div'),progressTrack=document.createElement('div'),progress=document.createElement('div'),status=document.createElement('p');
  row.className='budget-person-row';heading.className='budget-person-heading';name.textContent=label;heading.append(name);
  form.className='budget-form';form.dataset.owner=owner;formLabel.textContent='Monthly budget';form.append(formLabel);inputRow.className='budget-input-row';currency.textContent='₹';input.type='number';input.min='0.01';input.step='0.01';input.placeholder='Enter amount';input.required=true;input.value=budget??'';button.type='submit';button.className='primary';button.textContent='Save';inputRow.append(currency,input,button);form.append(inputRow);
  const addMetric=(container,title,value)=>{const labelNode=document.createElement('span'),valueNode=document.createElement('strong');labelNode.textContent=title;valueNode.textContent=value;container.append(labelNode,valueNode);return valueNode;};
  metrics.className='budget-metrics';addMetric(budgetMetric,'Budget',budget===null?'Not set':money(budget));addMetric(spentMetric,'Spent',money(spent));const remaining=budget===null?null:Number(budget)-Number(spent),remainingValue=addMetric(remainingMetric,'Remaining',remaining===null?'—':money(remaining));if(remaining!==null&&remaining<0)remainingValue.className='over-budget';metrics.append(budgetMetric,spentMetric,remainingMetric);
  progressTrack.className='budget-track';progressTrack.setAttribute('role','progressbar');progressTrack.setAttribute('aria-label',`${label} used`);progressTrack.setAttribute('aria-valuemin','0');progressTrack.setAttribute('aria-valuemax',String(budget||0));progressTrack.setAttribute('aria-valuenow',String(spent));progress.className='budget-progress';const ratio=budget?Number(spent)/Number(budget)*100:0;progress.style.width=`${Math.min(ratio,100)}%`;if(budget&&spent>budget)progress.classList.add('over-budget');progressTrack.append(progress);
  status.className='budget-status';status.textContent=budget===null?'Set a budget to track this month.':remaining<0?`Over budget by ${money(Math.abs(remaining))}.`:`${Math.round(ratio)}% of this month’s budget used.`;
  row.append(heading,form,metrics,progressTrack,status);return row;
}
function renderBudget(month,budget,spent,personalBudgets){
  ensureBudgetPanel();
  const label=new Date(`${month}-01T12:00:00`).toLocaleDateString('en-IN',{month:'long',year:'numeric'}),rows=$('#budgetRows');
  $('#budgetMonth').textContent=label;rows.replaceChildren(createBudgetRow('shared','Shared expenses',budget,spent));
  personalBudgets.forEach(item=>rows.append(createBudgetRow(item.owner,item.label,item.budget,item.spent)));
}
function setPersonBreakdown(id,person,rows,total){
  const amount=document.getElementById(id),card=amount.closest('article');
  const investmentRows=rows.filter(row=>row.ownership==='personal'&&row.person===person);
  const investment=investmentRows.filter(row=>row.category.trim().toLowerCase()==='investment').reduce((sum,row)=>sum+Number(row.total),0);
  if(!investmentRows.some(row=>row.category.trim().toLowerCase()==='investment')){
    card.innerHTML=`<span>${person==='You'?'Your personal':"Wife's personal"}</span><strong id="${id}">${money(total)}</strong><small>${person==='You'?'Only yours':'Only hers'}</small>`;
    return;
  }
  card.innerHTML=`<span>${person==='You'?'Your personal':"Wife's personal"}</span><div class="person-breakdown"><div><span>Investment</span><strong>${money(investment)}</strong></div><div><span>Other expenses</span><strong>${money(total-investment)}</strong></div><div class="person-breakdown-total"><span>Total</span><strong id="${id}">${money(total)}</strong></div></div>`;
}
function renderDashboard(d){
  renderBudget(d.budget_month,d.budget,d.budget_spent,d.personal_budgets);
  $('#total').textContent=money(d.total);
  $('#rangeLabel').textContent=`${new Date(d.start+'T12:00').toLocaleDateString('en-IN',{day:'numeric',month:'short'})} – ${new Date(d.end+'T12:00').toLocaleDateString('en-IN',{day:'numeric',month:'short'})}`;
  let sums={common:0,You:0,Wife:0};
  d.ownership.forEach(x=>sums[x.ownership==='common'?'common':x.person]=x.total);
  $('#commonTotal').textContent=money(sums.common);
  setPersonBreakdown('youTotal','You',d.person_categories,sums.You);
  setPersonBreakdown('wifeTotal','Wife',d.person_categories,sums.Wife);
  const monthlyTotals=Array(12).fill(0);
  d.monthly_totals.forEach(item=>{monthlyTotals[item.month-1]=Number(item.total);});
  const max=Math.max(...monthlyTotals,1),months=Array.from({length:12},(_,i)=>new Date(d.year,i,1).toLocaleDateString('en-IN',{month:'short'})),chart=$('#trendChart');
  chart.classList.remove('empty');
  chart.classList.toggle('no-data',!monthlyTotals.some(value=>value>0));
  chart.setAttribute('aria-label',`Monthly expenses for ${d.year}`);
  chart.innerHTML=monthlyTotals.map((value,i)=>`<div class="month-column" title="${months[i]}: ${money(value)}"><div class="month-bar-area"><div class="month-bar ${value?'has-value':''}" style="height:${value?Math.max(4,value/max*100):0}%" aria-hidden="true"></div></div><span class="month-label">${months[i]}</span></div>`).join('')+(monthlyTotals.some(value=>value>0)?'':'<span class="monthly-empty">No expenses recorded this year yet.</span>');
  let cmax=Math.max(...d.categories.map(x=>x.total),1);
  $('#categoryChart').classList.toggle('empty',!d.categories.length);
  $('#categoryChart').innerHTML=d.categories.length?d.categories.slice(0,6).map(x=>`<div class="category-row"><i class="dot" style="background:${x.color}"></i><span>${esc(x.name)}</span><strong>${money(x.total)}</strong><div class="track"><div class="fill" style="background:${x.color};width:${x.total/cmax*100}%"></div></div></div>`).join(''):'No categories to show yet.';
}
async function loadDashboard(){let p=new URLSearchParams({period:activePeriod});if($('#rangeFrom').value&&$('#rangeTo').value){p.set('from',$('#rangeFrom').value);p.set('to',$('#rangeTo').value)}renderDashboard(await api('/api/dashboard?'+p))}
function showExpense(e=null){$('#expenseForm').reset();$('#expenseId').value=e?.id||'';$('#expenseDialogTitle').textContent=e?'Edit expense':'Add an expense';$('#expenseDate').value=e?.expense_date||today();$('#amount').value=e?.amount||'';$('#note').value=e?.note||'';$('#category').value=e?.category_id||'';setOwner(e?(e.ownership==='common'?'common':e.person):'common');$('#expenseDialog').showModal();$('#amount').focus()}
function setOwner(o){owner=o;$$('.owner').forEach(x=>x.classList.toggle('active',x.dataset.owner===o))}
window.editExpense=id=>showExpense(expenses.find(x=>x.id===id));window.deleteExpense=async id=>{if(confirm('Remove this expense?')){await api('/api/expenses/'+id,{method:'DELETE'});toast('Expense removed');refresh()}};
function showCategory(c=null){$('#categoryForm').reset();$('#categoryId').value=c?.id||'';$('#categoryName').value=c?.name||'';$('#categoryColor').value=c?.color||'#5B6CFF';$('#categoryDialogTitle').textContent=c?'Edit category':'New category';$('#categoryDialog').showModal()}
window.editCategory=id=>showCategory(categories.find(c=>c.id===id));window.deleteCategory=async id=>{if(confirm('Remove this category?'))try{await api('/api/categories/'+id,{method:'DELETE'});toast('Category removed');loadCategories()}catch(e){toast(e.message)}};
async function refresh(){await Promise.all([loadDashboard(),loadExpenses()])}
$('#newExpense').onclick=()=>showExpense();$('#newCategory').onclick=()=>showCategory();$('#quickCategory').onclick=()=>showCategory();$$('.close').forEach(b=>b.onclick=()=>b.closest('dialog').close());$$('.owner').forEach(b=>b.onclick=()=>setOwner(b.dataset.owner));
$('#expenseForm').onsubmit=async e=>{e.preventDefault();let id=$('#expenseId').value;try{await api('/api/expenses'+(id?'/'+id:''),{method:id?'PUT':'POST',body:JSON.stringify({amount:$('#amount').value,category_id:$('#category').value,expense_date:$('#expenseDate').value,ownership:owner==='common'?'common':'personal',person:owner==='common'?null:owner,note:$('#note').value})});$('#expenseDialog').close();toast(id?'Expense updated':'Expense saved');refresh()}catch(err){toast(err.message)}};
$('#categoryForm').onsubmit=async e=>{e.preventDefault();let id=$('#categoryId').value;try{let result=await api('/api/categories'+(id?'/'+id:''),{method:id?'PUT':'POST',body:JSON.stringify({name:$('#categoryName').value,color:$('#categoryColor').value})});$('#categoryDialog').close();await loadCategories();if(!id&&$('#expenseDialog').open)$('#category').value=result.id;toast(id?'Category updated':'Category added')}catch(err){toast(err.message)}};
$$('.nav').forEach(b=>b.onclick=()=>switchView(b.dataset.view));$$('[data-switch]').forEach(b=>b.onclick=()=>switchView(b.dataset.switch));function switchView(v){$$('.view,.nav').forEach(x=>x.classList.toggle('active',x.id===v||x.dataset.view===v));$('#pageTitle').textContent=v==='dashboard'?'A clearer view of your spending.':v==='expenses'?'Every expense, in one place.':'Make the tracker yours.'}
$$('[data-period]').forEach(b=>b.onclick=()=>{activePeriod=b.dataset.period;$$('[data-period]').forEach(x=>x.classList.toggle('selected',x===b));$('#rangeFrom').value='';$('#rangeTo').value='';loadDashboard()});$('#applyRange').onclick=()=>{if($('#rangeFrom').value&&$('#rangeTo').value)loadDashboard();else toast('Choose both dates first.')};['#filterFrom','#filterTo','#filterOwnership','#filterCategory'].forEach(s=>$(s).onchange=loadExpenses);$('#clearFilters').onclick=()=>{$$('.filters input,.filters select').forEach(x=>x.value='');loadExpenses()};$('#export').onclick=()=>location.href='/api/export';
Promise.all([loadCategories(),refresh()]);
