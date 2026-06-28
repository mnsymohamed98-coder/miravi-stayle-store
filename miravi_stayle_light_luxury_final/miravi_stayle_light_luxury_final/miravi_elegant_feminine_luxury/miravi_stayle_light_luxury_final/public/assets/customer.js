let STORE_WHATSAPP = '972592386302';
let products = [];
let selectedProduct = null;

const grid = document.getElementById('productsGrid');
const searchInput = document.getElementById('searchInput');
const categoryFilter = document.getElementById('categoryFilter');
const modal = document.getElementById('orderModal');
const orderForm = document.getElementById('orderForm');
const selectedProductText = document.getElementById('selectedProductText');
const productIdInput = document.getElementById('productId');
const orderMessage = document.getElementById('orderMessage');
const phoneText = document.getElementById('phoneText');

const statusText = { available: 'متوفر', limited: 'كمية محدودة', unavailable: 'غير متوفر' };

function money(value) { return `${Number(value || 0).toLocaleString('ar')} ₪`; }
function escapeHTML(value) { return String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;'); }
function placeholderImage() { return `<img class="placeholder" src="./assets/miravi-logo.jpeg" alt="Miravi STAYLE">`; }

async function loadConfig() {
  try {
    const res = await fetch('/api/config', { cache: 'no-store' });
    const data = await res.json();
    if (data.ok && data.meta) {
      STORE_WHATSAPP = data.meta.whatsapp || STORE_WHATSAPP;
      if (phoneText) phoneText.textContent = data.meta.phoneLocal || '+972 59-238-6302';
      document.querySelectorAll('a[href^="https://wa.me/"]').forEach(a => { a.href = `https://wa.me/${STORE_WHATSAPP}`; });
      document.querySelectorAll('a[href^="tel:"]').forEach(a => { a.href = `tel:+${STORE_WHATSAPP}`; });
    }
  } catch {}
}

async function loadProducts() {
  try {
    const res = await fetch('/api/products', { cache: 'no-store' });
    const data = await res.json();
    if (!data.ok) throw new Error(data.message || 'فشل تحميل المنتجات');
    products = data.products || [];
    fillCategories();
    renderProducts();
  } catch (error) {
    grid.className = 'products-grid';
    grid.innerHTML = `<div class="empty">تعذر تحميل المنتجات: ${escapeHTML(error.message)}</div>`;
  }
}

function fillCategories() {
  const categories = [...new Set(products.map(p => p.category).filter(Boolean))];
  categoryFilter.innerHTML = '<option value="all">كل التصنيفات</option>' + categories.map(c => `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join('');
}

function renderProducts() {
  const q = (searchInput.value || '').trim().toLowerCase();
  const cat = categoryFilter.value;
  const filtered = products.filter(p => {
    const matchText = [p.name, p.category, p.description].join(' ').toLowerCase().includes(q);
    const matchCat = cat === 'all' || p.category === cat;
    return matchText && matchCat;
  });

  grid.className = 'products-grid';
  if (!filtered.length) { grid.innerHTML = '<div class="empty">لا توجد منتجات مطابقة حالياً.</div>'; return; }

  grid.innerHTML = filtered.map(p => `
    <article class="product-card">
      <div class="product-image">
        ${p.image ? `<img loading="lazy" src="${escapeHTML(p.image)}" alt="${escapeHTML(p.name)}" onerror="this.outerHTML='${placeholderImage().replaceAll("'", "\\'")}'">` : placeholderImage()}
      </div>
      <div class="product-body">
        <div class="product-top"><h3>${escapeHTML(p.name)}</h3><span class="badge ${p.status === 'limited' ? 'limited' : ''}">${statusText[p.status] || 'متوفر'}</span></div>
        <div class="price">${money(p.price)}</div>
        <p>${escapeHTML(p.description || 'قطعة مختارة بعناية لتناسب ذوقك.')}</p>
        <div class="product-meta"><span>${escapeHTML(p.category || 'عام')}</span><span>المخزون: ${Number(p.stock || 0)}</span></div>
        <button class="btn btn-primary full" onclick="openOrder('${p.id}')">احجزي الآن</button>
      </div>
    </article>`).join('');
}

function openOrder(id) {
  selectedProduct = products.find(p => p.id === id);
  if (!selectedProduct) return;
  productIdInput.value = selectedProduct.id;
  selectedProductText.textContent = `${selectedProduct.name} — السعر: ${money(selectedProduct.price)}`;
  orderForm.reset();
  productIdInput.value = selectedProduct.id;
  orderMessage.textContent = '';
  orderMessage.className = 'form-message';
  modal.hidden = false;
}
function closeModal() { modal.hidden = true; }

document.querySelectorAll('[data-close="modal"]').forEach(el => el.addEventListener('click', closeModal));
window.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeModal(); });
searchInput.addEventListener('input', renderProducts);
categoryFilter.addEventListener('change', renderProducts);

orderForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const body = Object.fromEntries(new FormData(orderForm).entries());
  orderMessage.textContent = 'جاري حفظ الطلب...';
  orderMessage.className = 'form-message';
  try {
    const res = await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!data.ok) throw new Error(data.message || 'فشل حفظ الطلب');
    orderMessage.textContent = 'تم حفظ الطلب بنجاح ✅ سيتم فتح واتساب للتأكيد.';
    orderMessage.className = 'form-message success';
    await loadProducts();
    setTimeout(() => { window.open(data.whatsappUrl || `https://wa.me/${STORE_WHATSAPP}`, '_blank'); closeModal(); }, 800);
  } catch (error) { orderMessage.textContent = error.message; orderMessage.className = 'form-message error'; }
});

(async () => { await loadConfig(); await loadProducts(); })();
window.openOrder = openOrder;
