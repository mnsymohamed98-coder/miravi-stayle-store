const PASSWORD_KEY = 'miravi_admin_password';
let orders = [];
const loginPanel = document.getElementById('loginPanel');
const adminPanel = document.getElementById('adminPanel');
const passwordInput = document.getElementById('passwordInput');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const refreshBtn = document.getElementById('refreshBtn');
const exportBtn = document.getElementById('exportBtn');
const ordersTable = document.getElementById('ordersTable');
const totalOrders = document.getElementById('totalOrders');
const newOrders = document.getElementById('newOrders');
const totalSales = document.getElementById('totalSales');

function adminPassword(){ return localStorage.getItem(PASSWORD_KEY) || ''; }
function setAdminPassword(v){ localStorage.setItem(PASSWORD_KEY, v); }
function clearAdminPassword(){ localStorage.removeItem(PASSWORD_KEY); }
function headers(){ return { 'Content-Type':'application/json', 'x-admin-password': adminPassword() }; }
function escapeHTML(value){ return String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;'); }
function money(value){ return `${Number(value || 0).toLocaleString('ar')} ₪`; }
function showAdmin(){ loginPanel.hidden = true; adminPanel.hidden = false; loadOrders(); }
function showLogin(){ loginPanel.hidden = false; adminPanel.hidden = true; }
function statusText(s){ return ({new:'طلب جديد',confirmed:'تم التأكيد',preparing:'قيد التجهيز',out_for_delivery:'خرج للتوصيل',delivered:'تم التسليم',cancelled:'ملغي'})[s] || s; }

loginBtn.addEventListener('click',()=>{const p=passwordInput.value.trim(); if(!p)return; setAdminPassword(p); showAdmin();});
passwordInput.addEventListener('keydown',e=>{if(e.key==='Enter') loginBtn.click();});
logoutBtn.addEventListener('click',()=>{clearAdminPassword();showLogin();});
refreshBtn.addEventListener('click',loadOrders);
exportBtn.addEventListener('click', exportOrdersCsv);

async function exportOrdersCsv(){
  try{
    const res = await fetch('/api/admin/export/orders.csv', {
      method: 'GET',
      headers: { 'x-admin-password': adminPassword() },
      cache: 'no-store'
    });

    if(res.status === 401){
      clearAdminPassword();
      showLogin();
      alert('كلمة مرور الإدارة غير صحيحة. سجّل الدخول مرة ثانية.');
      return;
    }

    if(!res.ok){
      const text = await res.text();
      throw new Error(text || 'فشل تصدير ملف CSV');
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `miravi-orders-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }catch(error){
    alert(error.message || 'فشل تصدير ملف CSV');
  }
}

async function loadOrders(){
  try{
    const res=await fetch('/api/admin/orders',{headers:{'x-admin-password':adminPassword()},cache:'no-store'});
    const data=await res.json();
    if(res.status===401){clearAdminPassword();showLogin();return;}
    if(!data.ok) throw new Error(data.message || 'فشل تحميل الطلبات');
    orders=data.orders||[]; renderOrders();
  }catch(error){ordersTable.innerHTML=`<tr><td colspan="8" class="error-cell">${escapeHTML(error.message)}</td></tr>`;}
}
function renderOrders(){
  totalOrders.textContent=orders.length;
  newOrders.textContent=orders.filter(o=>o.status==='new').length;
  totalSales.textContent=money(orders.filter(o=>o.status!=='cancelled').reduce((s,o)=>s+Number(o.total||0),0));
  if(!orders.length){ordersTable.innerHTML='<tr><td colspan="8">لا توجد طلبات بعد.</td></tr>'; return;}
  ordersTable.innerHTML=orders.map(o=>`
    <tr>
      <td><small>${escapeHTML(o.id)}</small><br><small>${new Date(o.createdAt).toLocaleString('ar')}</small></td>
      <td>${escapeHTML(o.productName)}<br><small>الكمية: ${o.quantity}</small></td>
      <td>${escapeHTML(o.customerName)}<br><small>${escapeHTML(o.address)}</small></td>
      <td dir="ltr">${escapeHTML(o.customerPhone)}</td>
      <td>${escapeHTML(o.area)}</td>
      <td>${money(o.total)}</td>
      <td><select class="input mini" onchange="updateStatus('${o.id}', this.value)">${['new','confirmed','preparing','out_for_delivery','delivered','cancelled'].map(s=>`<option value="${s}" ${o.status===s?'selected':''}>${statusText(s)}</option>`).join('')}</select></td>
      <td><a class="tiny-btn" target="_blank" href="https://wa.me/${String(o.customerPhone||'').replace(/[^0-9]/g,'')}">واتساب</a></td>
    </tr>`).join('');
}
async function updateStatus(id,status){
  try{
    const res=await fetch(`/api/admin/orders/${id}`,{method:'PATCH',headers:headers(),body:JSON.stringify({status})});
    const data=await res.json(); if(!data.ok) throw new Error(data.message || 'فشل تحديث الطلب');
    await loadOrders();
  }catch(error){ alert(error.message); }
}
if(adminPassword()) showAdmin(); else showLogin();
window.updateStatus=updateStatus;
