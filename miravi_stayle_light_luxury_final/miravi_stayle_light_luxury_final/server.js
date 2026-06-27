/*
  Miravi STAYLE Store - Light Luxury Supabase Version
  - Persistent products/orders in Supabase database
  - Persistent product images in Supabase Storage
  - Mobile-friendly image upload and safe storage filenames
*/

require('dotenv').config();

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const ADMIN_PASSWORD = process.env.MIRAVI_ADMIN_PASSWORD || 'Miravi2026!';
const STORE_PHONE_LOCAL = process.env.STORE_PHONE_LOCAL || '+972 59-238-6302';
const STORE_PHONE_WHATSAPP = process.env.STORE_PHONE_WHATSAPP || '972592386302';

const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const SUPABASE_STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'product-images';

const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    })
  : null;

app.use(express.json({ limit: '32mb' }));
app.use(express.urlencoded({ extended: true, limit: '32mb' }));
app.use(express.static(PUBLIC_DIR, {
  etag: true,
  maxAge: '1h',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-store');
  }
}));

function nowISO() {
  return new Date().toISOString();
}

function uid(prefix) {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(5).toString('hex')}`;
}

function sanitizeText(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function isAdmin(req) {
  return Boolean(req.headers['x-admin-password'] && req.headers['x-admin-password'] === ADMIN_PASSWORD);
}

function requireAdmin(req, res) {
  if (!isAdmin(req)) {
    res.status(401).json({ ok: false, message: 'كلمة مرور الإدارة غير صحيحة.' });
    return false;
  }
  return true;
}

function requireSupabase(res) {
  if (!supabase) {
    res.status(500).json({
      ok: false,
      message: 'قاعدة بيانات Supabase غير مربوطة. أضف SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY في Render Environment.'
    });
    return false;
  }
  return true;
}

function csvEscape(value) {
  const s = String(value ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function productStatusArabic(status) {
  return ({ available: 'متوفر', limited: 'كمية محدودة', unavailable: 'غير متوفر' })[status] || status || '';
}

function orderStatusArabic(status) {
  return ({
    new: 'طلب جديد',
    confirmed: 'تم التأكيد',
    preparing: 'قيد التجهيز',
    out_for_delivery: 'خرج للتوصيل',
    delivered: 'تم التسليم',
    cancelled: 'ملغي'
  })[status] || status || '';
}

function toCamelProduct(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    price: Number(row.price || 0),
    stock: Number(row.stock || 0),
    status: row.status,
    image: row.image || '',
    description: row.description || '',
    isFeatured: Boolean(row.is_featured),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toDbProduct(input) {
  return {
    name: sanitizeText(input.name, 120),
    category: sanitizeText(input.category || 'عام', 80),
    price: Math.max(0, Number(input.price) || 0),
    stock: Math.max(0, parseInt(input.stock || '0', 10)),
    status: ['available', 'limited', 'unavailable'].includes(input.status) ? input.status : 'available',
    image: sanitizeText(input.image, 8000),
    description: sanitizeText(input.description, 900),
    is_featured: Boolean(input.isFeatured),
    updated_at: nowISO()
  };
}

function toCamelOrder(row) {
  if (!row) return null;
  return {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    quantity: Number(row.quantity || 1),
    unitPrice: Number(row.unit_price || 0),
    total: Number(row.total || 0),
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    area: row.area,
    address: row.address,
    size: row.size || '',
    color: row.color || '',
    notes: row.notes || '',
    status: row.status,
    adminNote: row.admin_note || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function looksLikeDataUrl(value) {
  return /^data:image\/(png|jpe?g|webp);base64,/i.test(String(value || ''));
}

function imageExtFromMime(mime) {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}

async function uploadProductImageIfNeeded(imageValue) {
  const image = String(imageValue || '').trim();
  if (!image || !looksLikeDataUrl(image)) return image;
  if (!supabase) throw new Error('Supabase غير مربوط، لا يمكن رفع الصورة.');

  const match = image.match(/^data:(image\/(?:png|jpe?g|webp));base64,(.+)$/i);
  if (!match) throw new Error('صيغة الصورة غير مدعومة. استخدم JPG أو PNG أو WEBP.');

  const mime = match[1].toLowerCase().replace('image/jpg', 'image/jpeg');
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > 10 * 1024 * 1024) {
    throw new Error('الصورة كبيرة جداً بعد الضغط. اختر صورة أصغر أو التقط Screenshot وجرب مرة أخرى.');
  }

  // Safe ASCII-only key. No Arabic product name inside the storage path.
  const ext = imageExtFromMime(mime);
  const filePath = `products/${Date.now()}-${crypto.randomBytes(16).toString('hex')}.${ext}`;

  const { error } = await supabase.storage
    .from(SUPABASE_STORAGE_BUCKET)
    .upload(filePath, buffer, {
      contentType: mime,
      cacheControl: '31536000',
      upsert: false
    });

  if (error) throw new Error(`فشل رفع الصورة إلى Supabase Storage: ${error.message}`);

  const { data } = supabase.storage.from(SUPABASE_STORAGE_BUCKET).getPublicUrl(filePath);
  return data.publicUrl;
}

function createWhatsAppOrderMessage(order, product) {
  const lines = [
    'طلب جديد من متجر Miravi STAYLE',
    `رقم الطلب: ${order.id}`,
    `المنتج: ${product?.name || order.productName}`,
    `الكمية: ${order.quantity}`,
    `الإجمالي: ${order.total} ₪`,
    `الاسم: ${order.customerName}`,
    `الجوال: ${order.customerPhone}`,
    `المنطقة: ${order.area}`,
    `العنوان: ${order.address}`,
    order.size ? `المقاس: ${order.size}` : '',
    order.color ? `اللون: ${order.color}` : '',
    order.notes ? `ملاحظات: ${order.notes}` : ''
  ].filter(Boolean);
  return `https://wa.me/${STORE_PHONE_WHATSAPP}?text=${encodeURIComponent(lines.join('\n'))}`;
}

async function bootstrapSupabase() {
  if (!supabase) {
    console.warn('Supabase is not configured.');
    return;
  }

  try {
    const { error: bucketError } = await supabase.storage.createBucket(SUPABASE_STORAGE_BUCKET, {
      public: true,
      fileSizeLimit: 10 * 1024 * 1024,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp']
    });
    if (bucketError && !/already exists|Duplicate/i.test(bucketError.message)) {
      console.warn('Storage bucket warning:', bucketError.message);
    }
  } catch (error) {
    console.warn('Storage bucket check warning:', error.message);
  }

  try {
    const { count, error } = await supabase.from('products').select('id', { count: 'exact', head: true });
    if (error) {
      console.warn('Supabase tables are not ready. Run supabase/schema.sql. Details:', error.message);
      return;
    }
    if (count === 0) {
      const seedProducts = [
        {
          id: uid('prd'),
          name: 'عباية ميرافي كلاسيك',
          category: 'عبايات',
          price: 120,
          stock: 10,
          status: 'available',
          image: '',
          description: 'تصميم محتشم وأنيق مناسب للمشاوير اليومية والمناسبات الهادئة.',
          is_featured: true,
          created_at: nowISO(),
          updated_at: nowISO()
        },
        {
          id: uid('prd'),
          name: 'طقم ستايل ناعم',
          category: 'أطقم',
          price: 95,
          stock: 6,
          status: 'limited',
          image: '',
          description: 'طقم مرتب بخامة مريحة ولمسة أنثوية بسيطة.',
          is_featured: true,
          created_at: nowISO(),
          updated_at: nowISO()
        }
      ];
      const { error: insertError } = await supabase.from('products').insert(seedProducts);
      if (insertError) console.warn('Seed insert warning:', insertError.message);
    }
  } catch (error) {
    console.warn('Bootstrap warning:', error.message);
  }
}

app.get('/api/config', (req, res) => {
  res.json({
    ok: true,
    meta: {
      storeName: 'Miravi STAYLE',
      arabicName: 'ميرافي ستايل',
      tagline: 'أناقة تحتشمين بها',
      subTagline: 'بعناية لتناسب ذوقك',
      location: 'فلسطين - غزة',
      delivery: 'التوصيل يشمل كافة مناطق قطاع غزة',
      phoneLocal: STORE_PHONE_LOCAL,
      whatsapp: STORE_PHONE_WHATSAPP
    }
  });
});

app.get('/api/products', async (req, res) => {
  if (!requireSupabase(res)) return;
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .neq('status', 'unavailable')
    .order('is_featured', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ ok: false, message: error.message });
  res.json({ ok: true, products: (data || []).map(toCamelProduct) });
});

app.get('/api/admin/products', async (req, res) => {
  if (!requireAdmin(req, res) || !requireSupabase(res)) return;
  const { data, error } = await supabase.from('products').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ ok: false, message: error.message });
  res.json({ ok: true, products: (data || []).map(toCamelProduct) });
});

app.post('/api/admin/products', async (req, res) => {
  if (!requireAdmin(req, res) || !requireSupabase(res)) return;
  try {
    const body = req.body || {};
    const product = toDbProduct(body);
    if (!product.name) return res.status(400).json({ ok: false, message: 'اسم المنتج مطلوب.' });
    product.id = uid('prd');
    product.image = await uploadProductImageIfNeeded(body.imageData || body.image || '');
    product.created_at = nowISO();
    product.updated_at = nowISO();

    const { data, error } = await supabase.from('products').insert(product).select('*').single();
    if (error) throw error;
    res.status(201).json({ ok: true, product: toCamelProduct(data), message: 'تمت إضافة المنتج بنجاح.' });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.put('/api/admin/products/:id', async (req, res) => {
  if (!requireAdmin(req, res) || !requireSupabase(res)) return;
  try {
    const id = req.params.id;
    const body = req.body || {};
    const product = toDbProduct(body);
    if (!product.name) return res.status(400).json({ ok: false, message: 'اسم المنتج مطلوب.' });
    if (body.imageData) product.image = await uploadProductImageIfNeeded(body.imageData);
    else product.image = sanitizeText(body.image || '', 8000);
    product.updated_at = nowISO();

    const { data, error } = await supabase.from('products').update(product).eq('id', id).select('*').single();
    if (error) throw error;
    res.json({ ok: true, product: toCamelProduct(data), message: 'تم تحديث المنتج.' });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.delete('/api/admin/products/:id', async (req, res) => {
  if (!requireAdmin(req, res) || !requireSupabase(res)) return;
  const { error } = await supabase.from('products').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ ok: false, message: error.message });
  res.json({ ok: true, message: 'تم حذف المنتج.' });
});

app.post('/api/orders', async (req, res) => {
  if (!requireSupabase(res)) return;
  try {
    const body = req.body || {};
    const { data: row, error: productError } = await supabase.from('products').select('*').eq('id', body.productId).single();
    if (productError || !row) return res.status(404).json({ ok: false, message: 'المنتج غير موجود.' });
    const product = toCamelProduct(row);
    if (product.status === 'unavailable') return res.status(400).json({ ok: false, message: 'هذا المنتج غير متوفر حالياً.' });

    const quantity = Math.max(1, parseInt(body.quantity || '1', 10));
    if (product.stock > 0 && quantity > product.stock) {
      return res.status(400).json({ ok: false, message: 'الكمية المطلوبة أكبر من المخزون المتوفر.' });
    }

    const order = {
      id: uid('ord'),
      product_id: product.id,
      product_name: product.name,
      quantity,
      unit_price: product.price,
      total: product.price * quantity,
      customer_name: sanitizeText(body.customerName, 120),
      customer_phone: sanitizeText(body.customerPhone, 40),
      area: sanitizeText(body.area, 80),
      address: sanitizeText(body.address, 250),
      size: sanitizeText(body.size, 60),
      color: sanitizeText(body.color, 60),
      notes: sanitizeText(body.notes, 500),
      status: 'new',
      admin_note: '',
      created_at: nowISO(),
      updated_at: nowISO()
    };

    if (!order.customer_name || !order.customer_phone || !order.area || !order.address) {
      return res.status(400).json({ ok: false, message: 'الاسم والجوال والمنطقة والعنوان مطلوبة.' });
    }

    const { data: inserted, error: orderError } = await supabase.from('orders').insert(order).select('*').single();
    if (orderError) throw orderError;

    if (product.stock > 0) {
      const newStock = Math.max(0, product.stock - quantity);
      const newStatus = newStock === 0 ? 'unavailable' : newStock <= 3 ? 'limited' : product.status;
      await supabase.from('products').update({ stock: newStock, status: newStatus, updated_at: nowISO() }).eq('id', product.id);
    }

    const camelOrder = toCamelOrder(inserted);
    res.status(201).json({
      ok: true,
      order: camelOrder,
      whatsappUrl: createWhatsAppOrderMessage(camelOrder, product),
      message: 'تم تسجيل الطلب بنجاح.'
    });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.get('/api/admin/orders', async (req, res) => {
  if (!requireAdmin(req, res) || !requireSupabase(res)) return;
  const { data: orders, error: ordersError } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
  if (ordersError) return res.status(500).json({ ok: false, message: ordersError.message });
  const { data: products } = await supabase.from('products').select('*');
  res.json({ ok: true, orders: (orders || []).map(toCamelOrder), products: (products || []).map(toCamelProduct) });
});

app.patch('/api/admin/orders/:id', async (req, res) => {
  if (!requireAdmin(req, res) || !requireSupabase(res)) return;
  const statuses = ['new', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled'];
  const patch = { updated_at: nowISO() };
  if (req.body.status && statuses.includes(req.body.status)) patch.status = req.body.status;
  if (req.body.adminNote !== undefined) patch.admin_note = sanitizeText(req.body.adminNote, 500);
  const { data, error } = await supabase.from('orders').update(patch).eq('id', req.params.id).select('*').single();
  if (error) return res.status(500).json({ ok: false, message: error.message });
  res.json({ ok: true, order: toCamelOrder(data), message: 'تم تحديث الطلب.' });
});

app.get('/api/admin/export/orders.csv', async (req, res) => {
  if (!requireAdmin(req, res) || !requireSupabase(res)) return;
  const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ ok: false, message: error.message });
  const header = ['رقم الطلب', 'التاريخ', 'المنتج', 'الكمية', 'السعر', 'الإجمالي', 'اسم الزبونة', 'الجوال', 'المنطقة', 'العنوان', 'الحالة', 'ملاحظات الزبونة', 'ملاحظة الإدارة'];
  const rows = (data || []).map(o => [
    o.id,
    new Date(o.created_at).toLocaleString('ar'),
    o.product_name,
    o.quantity,
    o.unit_price,
    o.total,
    o.customer_name,
    o.customer_phone,
    o.area,
    o.address,
    orderStatusArabic(o.status),
    o.notes,
    o.admin_note
  ]);
  const csv = '\ufeff' + [header, ...rows].map(row => row.map(csvEscape).join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="miravi-orders.csv"');
  res.setHeader('Cache-Control', 'no-store');
  res.end(csv);
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, status: 'Miravi STAYLE is running', supabase: Boolean(supabase), time: nowISO() });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

bootstrapSupabase().then(() => {
  app.listen(PORT, () => {
    console.log('==============================================');
    console.log(' Miravi STAYLE Store is running');
    console.log(` Open: http://localhost:${PORT}`);
    console.log(` Admin products: http://localhost:${PORT}/admin-products.html`);
    console.log(` Admin orders:   http://localhost:${PORT}/admin-orders.html`);
    console.log(' Phone:', STORE_PHONE_LOCAL);
    console.log(' WhatsApp:', STORE_PHONE_WHATSAPP);
    console.log(' Supabase:', SUPABASE_URL ? 'configured' : 'missing');
    console.log('==============================================');
  });
});
