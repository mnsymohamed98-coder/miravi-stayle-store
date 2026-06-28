const PASSWORD_KEY = 'miravi_admin_password';
let products = [];
let editingId = null;
let selectedImageData = '';

const loginPanel = document.getElementById('loginPanel');
const adminPanel = document.getElementById('adminPanel');
const passwordInput = document.getElementById('passwordInput');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const productForm = document.getElementById('productForm');
const productsTable = document.getElementById('productsTable');
const formMessage = document.getElementById('formMessage');
const refreshBtn = document.getElementById('refreshBtn');
const resetBtn = document.getElementById('resetBtn');
const imageFile = document.getElementById('imageFile');
const imageInput = document.getElementById('image');
const imageDataInput = document.getElementById('imageData');
const imagePreview = document.getElementById('imagePreview');
const removeImageBtn = document.getElementById('removeImageBtn');

function adminPassword() { return localStorage.getItem(PASSWORD_KEY) || ''; }
function setAdminPassword(value) { localStorage.setItem(PASSWORD_KEY, value); }
function clearAdminPassword() { localStorage.removeItem(PASSWORD_KEY); }
function escapeHTML(value) { return String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;'); }
function money(value) { return `${Number(value || 0).toLocaleString('ar')} ₪`; }
function setMessage(msg, type='') { formMessage.textContent = msg || ''; formMessage.className = `form-message ${type}`; }
function headers() { return { 'Content-Type': 'application/json', 'x-admin-password': adminPassword() }; }
function showAdmin() { loginPanel.hidden = true; adminPanel.hidden = false; loadProducts(); }
function showLogin() { loginPanel.hidden = false; adminPanel.hidden = true; }

loginBtn.addEventListener('click', () => { const pass = passwordInput.value.trim(); if (!pass) return; setAdminPassword(pass); showAdmin(); });
passwordInput.addEventListener('keydown', e => { if (e.key === 'Enter') loginBtn.click(); });
logoutBtn.addEventListener('click', () => { clearAdminPassword(); showLogin(); });
refreshBtn.addEventListener('click', loadProducts);
resetBtn.addEventListener('click', resetForm);

function renderPreview(src) {
  if (!src) { imagePreview.innerHTML = '<span>اختاري صورة JPG / PNG / WEBP</span>'; return; }
  imagePreview.innerHTML = `<img src="${src}" alt="معاينة الصورة">`;
}

function resetForm() {
  editingId = null;
  selectedImageData = '';
  productForm.reset();
  document.getElementById('productId').value = '';
  imageInput.value = '';
  imageDataInput.value = '';
  imageFile.value = '';
  renderPreview('');
  setMessage('');
}

function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('تعذر قراءة الصورة. إذا كانت HEIC من iPhone حوليها إلى JPG أو التقطي Screenshot.'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('تعذر فتح ملف الصورة.'));
    reader.readAsDataURL(file);
  });
}

async function compressImage(file) {
  const type = (file.type || '').toLowerCase();
  if (type.includes('heic') || type.includes('heif')) throw new Error('صيغة HEIC غير مدعومة على المتصفح. اختاري JPG/PNG أو التقطي Screenshot.');
  if (!type.startsWith('image/')) throw new Error('الملف المختار ليس صورة.');
  const img = await fileToImage(file);
  const maxSide = 1800;
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
  const width = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
  const height = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f8f0df';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  let quality = 0.86;
  let dataUrl = canvas.toDataURL('image/jpeg', quality);
  while (dataUrl.length > 10_500_000 && quality > 0.55) {
    quality -= 0.08;
    dataUrl = canvas.toDataURL('image/jpeg', quality);
  }
  if (dataUrl.length > 12_000_000) throw new Error('الصورة كبيرة جدًا. اختاري صورة أصغر أو Screenshot.');
  return dataUrl;
}

imageFile.addEventListener('change', async () => {
  const file = imageFile.files && imageFile.files[0];
  if (!file) return;
  setMessage('جاري تجهيز الصورة من الجهاز...', '');
  try {
    selectedImageData = await compressImage(file);
    imageDataInput.value = selectedImageData;
    imageInput.value = '';
    renderPreview(selectedImageData);
    setMessage('تم تجهيز الصورة ✅ اضغطي حفظ المنتج للرفع.', 'success');
  } catch (error) {
    selectedImageData = '';
    imageDataInput.value = '';
    renderPreview('');
    setMessage(error.message, 'error');
  }
});

removeImageBtn.addEventListener('click', () => {
  selectedImageData = '';
  imageInput.value = '';
  imageDataInput.value = '';
  imageFile.value = '';
  renderPreview('');
});

async function loadProducts() {
  try {
    const res = await fetch('/api/admin/products', { headers: { 'x-admin-password': adminPassword() }, cache: 'no-store' });
    const data = await res.json();
    if (res.status === 401) { clearAdminPassword(); showLogin(); return; }
    if (!data.ok) throw new Error(data.message || 'فشل تحميل المنتجات');
    products = data.products || [];
    renderTable();
  } catch (error) { productsTable.innerHTML = `<tr><td colspan="7" class="error-cell">${escapeHTML(error.message)}</td></tr>`; }
}

function statusLabel(status) { return ({ available: 'متوفر', limited: 'كمية محدودة', unavailable: 'غير متوفر' })[status] || status; }
function thumb(src) { return src ? `<img class="admin-thumb" src="${escapeHTML(src)}" alt="صورة">` : '<span class="no-thumb">بدون صورة</span>'; }

function renderTable() {
  if (!products.length) { productsTable.innerHTML = '<tr><td colspan="7">لا توجد منتجات بعد.</td></tr>'; return; }
  productsTable.innerHTML = products.map(p => `
    <tr>
      <td>${thumb(p.image)}</td>
      <td><strong>${escapeHTML(p.name)}</strong><br><small>${escapeHTML(p.description || '')}</small></td>
      <td>${escapeHTML(p.category || '')}</td>
      <td>${money(p.price)}</td>
      <td>${Number(p.stock || 0)}</td>
      <td>${statusLabel(p.status)}</td>
      <td><div class="table-actions"><button class="tiny-btn" onclick="editProduct('${p.id}')">تعديل</button><button class="tiny-btn danger" onclick="deleteProduct('${p.id}')">حذف</button></div></td>
    </tr>`).join('');
}

function getFormBody() {
  return {
    name: document.getElementById('name').value,
    category: document.getElementById('category').value,
    price: document.getElementById('price').value,
    stock: document.getElementById('stock').value,
    status: document.getElementById('status').value,
    image: imageInput.value,
    imageData: imageDataInput.value,
    description: document.getElementById('description').value,
    isFeatured: document.getElementById('isFeatured').checked
  };
}

productForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setMessage('جاري حفظ المنتج...', '');
  try {
    const body = getFormBody();
    const url = editingId ? `/api/admin/products/${editingId}` : '/api/admin/products';
    const method = editingId ? 'PUT' : 'POST';
    const res = await fetch(url, { method, headers: headers(), body: JSON.stringify(body) });
    const data = await res.json();
    if (!data.ok) throw new Error(data.message || 'فشل حفظ المنتج');
    setMessage(data.message || 'تم الحفظ بنجاح ✅', 'success');
    resetForm();
    await loadProducts();
  } catch (error) { setMessage(error.message, 'error'); }
});

function editProduct(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  editingId = id;
  document.getElementById('productId').value = id;
  document.getElementById('name').value = p.name || '';
  document.getElementById('category').value = p.category || '';
  document.getElementById('price').value = p.price || 0;
  document.getElementById('stock').value = p.stock || 0;
  document.getElementById('status').value = p.status || 'available';
  document.getElementById('description').value = p.description || '';
  document.getElementById('isFeatured').checked = Boolean(p.isFeatured);
  imageInput.value = p.image || '';
  imageDataInput.value = '';
  selectedImageData = '';
  imageFile.value = '';
  renderPreview(p.image || '');
  setMessage('أنت تعدّل المنتج الآن. اختر صورة جديدة فقط إذا أردت تغييرها.', '');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deleteProduct(id) {
  if (!confirm('هل تريد حذف المنتج؟')) return;
  try {
    const res = await fetch(`/api/admin/products/${id}`, { method: 'DELETE', headers: { 'x-admin-password': adminPassword() } });
    const data = await res.json();
    if (!data.ok) throw new Error(data.message || 'فشل الحذف');
    await loadProducts();
  } catch (error) { alert(error.message); }
}

if (adminPassword()) showAdmin(); else showLogin();
window.editProduct = editProduct;
window.deleteProduct = deleteProduct;
