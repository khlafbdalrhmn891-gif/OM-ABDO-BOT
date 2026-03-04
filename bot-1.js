// ==============================
// بوت واتساب - متجر أم عبدو
// ==============================
// npm install whatsapp-web.js qrcode-terminal mongoose

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode   = require('qrcode-terminal');
const mongoose = require('mongoose');

// ====== إعدادات المتجر ======
const ADMIN_PHONE  = '01021477812';
const VODAFONE     = '01001655619';
const STORE_NAME   = 'متجر أم عبدو';
let   cleaningFee  = 5;
let   ordersOpen   = true;
let   orderCounter = 1000;

// ====== MongoDB ======
const MONGO_URI = process.env.MONGO_URI || '';
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB متصل!'))
  .catch(err => console.error('❌ خطأ MongoDB:', err.message));

const Order = mongoose.model('Order', new mongoose.Schema({
  orderId:   { type: String, unique: true },
  name:      String,
  phone:     String,
  address:   String,
  items:     Array,
  total:     Number,
  status:    { type: String, default: 'pending' },
  createdAt: { type: Date, default: Date.now }
}));

const Settings = mongoose.model('Settings', new mongoose.Schema({
  key:   { type: String, unique: true },
  value: mongoose.Schema.Types.Mixed
}));

async function loadSettings() {
  try {
    const cf   = await Settings.findOne({ key: 'cleaningFee' });
    if (cf) cleaningFee = cf.value;
    const oo   = await Settings.findOne({ key: 'ordersOpen' });
    if (oo) ordersOpen = oo.value;
    const last = await Order.findOne().sort({ createdAt: -1 });
    if (last) orderCounter = parseInt(last.orderId.replace('ORD-', '')) || 1000;
    console.log(`✅ إعدادات محملة | نظافة=${cleaningFee} | استقبال=${ordersOpen} | آخر أوردر=${orderCounter}`);
  } catch (e) { console.error('⚠️ خطأ إعدادات:', e.message); }
}

async function saveSetting(key, value) {
  await Settings.findOneAndUpdate({ key }, { value }, { upsert: true });
}

// ====== المنتجات ======
const products = [
  { id:1, name:'بطاطس', price:8,  unit:'كيلو', emoji:'🥔', askWeight:false },
  { id:2, name:'طماطم', price:6,  unit:'كيلو', emoji:'🍅', askWeight:false },
  { id:3, name:'بصل',   price:5,  unit:'كيلو', emoji:'🧅', askWeight:false },
  { id:4, name:'ثوم',   price:30, unit:'كيلو', emoji:'🧄', askWeight:false },
  { id:5, name:'جزر',   price:7,  unit:'كيلو', emoji:'🥕', askWeight:false },
  { id:6, name:'فراخ',  price:45, unit:'حبة',  emoji:'🐔', askWeight:true  },
];

// ====== Sessions ======
const sessions = {};
function getSession(phone) {
  if (!sessions[phone]) sessions[phone] = { step:'main', cart:[], name:'', phone:'', address:'', chosen:null };
  return sessions[phone];
}

// ====== دوال الرسائل ======
function mainMenu() {
  if (!ordersOpen) return `🌾 ${STORE_NAME} 🌾\n\n⏸️ الطلبات متوقفة مؤقتاً\n\nللتواصل المباشر:\n📞 ${ADMIN_PHONE}`;
  return `🌾 ${STORE_NAME} ترحب بكم 🌾\n\n1️⃣ عرض المنتجات\n2️⃣ إضافة للسلة\n3️⃣ سلتي وتعديلها\n4️⃣ تتبع طلب\n0️⃣ الرئيسية\n\n💳 فودافون كاش: ${VODAFONE}\n📞 للتواصل: ${ADMIN_PHONE}`;
}

function prodList() {
  let t = '🌿 *منتجاتنا:*\n\n';
  products.forEach((p, i) => {
    t += `${p.emoji} *${i+1}. ${p.name}* - ${p.price > 0 ? p.price+' ج/'+p.unit : 'سعر متغير ⚠️'}\n`;
  });
  return t;
}

function cartText(cart) {
  if (!cart.length) return '🛒 السلة فارغة';
  let t = '🛒 *سلتك:*\n\n', total = 0, hasUnpriced = false;
  cart.forEach(i => {
    const base  = i.price > 0 ? (i.askWeight ? Math.round(i.price * i.weight) : i.price * i.qty) : 0;
    const clean = i.cleanTotal || 0;
    const s     = base + clean;
    total += s;
    if (i.price === 0) hasUnpriced = true;
    const qStr = i.askWeight ? `${i.qty} فرخة / ${i.weight} كيلو` : `${i.qty} ${i.unit}`;
    t += `${i.emoji} ${i.name} (${qStr}) = ${s > 0 ? s+' ج' : 'سعر متغير'}\n`;
    if (i.wantClean && clean > 0) t += `   🧹 نظافة: ${i.qty} × ${i.cleanFee} = ${clean} ج\n`;
  });
  t += `\n💰 *الإجمالي: ${total > 0 ? total+' ج' : 'سيتم الإخبار بالسعر'}*`;
  if (hasUnpriced) t += '\n⚠️ بعض الأصناف سيتم إرسال سعرها إليك';
  return t;
}

function cartMenu(cart) {
  return cartText(cart) + '\n─────────────\n1️⃣ إضافة منتج آخر\n2️⃣ إزالة منتج من السلة\n3️⃣ تأكيد الطلب\n0️⃣ رجوع للقائمة';
}

// ====== تشغيل العميل ======
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: './.wwebjs_auth' }),
  puppeteer: {
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  }
});

// ====== أحداث البوت ======
client.on('qr', qr => {
  console.log('\n📱 سكان الكود ده بواتساب أمك:\n');
  qrcode.generate(qr, { small: true });
});

client.on('ready', async () => {
  console.log(`\n✅ البوت شغال! - ${STORE_NAME}`);
  await loadSettings();
});

client.on('disconnected', reason => {
  console.log('⚠️ البوت اتقطع:', reason);
  setTimeout(() => client.initialize(), 5000);
});

// ====== معالجة الرسائل ======
client.on('message', async (msg) => {
  if (msg.fromMe) return;
  const phone = msg.from;
  const text  = msg.body.trim();
  const sess  = getSession(phone);
  const t     = text;

  // رجوع للقائمة دايماً
  if (t === '0') {
    sess.step = 'main';
    await msg.reply(mainMenu());
    return;
  }

  // ===== القائمة الرئيسية =====
  if (sess.step === 'main') {
    if (!ordersOpen && (t === '2' || t === '3')) {
      await msg.reply(`⏸️ الطلبات متوقفة مؤقتاً\nللتواصل: ${ADMIN_PHONE}`);
      return;
    }
    if      (t === '1') await msg.reply(prodList() + '\n─────────────\n0️⃣ رجوع');
    else if (t === '2') { sess.step = 'choose_product'; await msg.reply(prodList() + '\n─────────────\nأرسل رقم المنتج:\n0️⃣ رجوع'); }
    else if (t === '3' || t === '4') {
      if (!sess.cart.length) { await msg.reply('🛒 السلة فارغة\n\nأرسل 2 لإضافة منتجات\n0️⃣ رجوع'); return; }
      sess.step = 'cart_menu';
      await msg.reply(cartMenu(sess.cart));
    }
    else if (t === '5') { sess.step = 'track'; await msg.reply('🔍 أرسل رقم الأوردر:\n0️⃣ رجوع'); }
    else await msg.reply(mainMenu());
    return;
  }

  // ===== قائمة السلة =====
  if (sess.step === 'cart_menu') {
    if (t === '1') {
      sess.step = 'choose_product';
      await msg.reply(prodList() + '\n─────────────\nأرسل رقم المنتج:\n0️⃣ رجوع');
    }
    else if (t === '2') {
      if (!sess.cart.length) { await msg.reply('❌ السلة فارغة!\n0️⃣ رجوع'); return; }
      let list = '🗑️ اختار رقم الصنف اللي عايز تشيله:\n\n';
      sess.cart.forEach((item, i) => {
        const q = item.askWeight ? `${item.qty} فرخة/${item.weight} كيلو` : `${item.qty} ${item.unit}`;
        list += `${i+1}. ${item.emoji} ${item.name} (${q})\n`;
      });
      list += '\n0️⃣ رجوع بدون حذف';
      await msg.reply(list);
      sess.step = 'remove_item';
    }
    else if (t === '3') {
      if (!sess.cart.length) { await msg.reply('❌ السلة فارغة!\n0️⃣ رجوع'); return; }
      if (!ordersOpen) { await msg.reply(`⏸️ الطلبات متوقفة\nللتواصل: ${ADMIN_PHONE}`); return; }
      sess.step = 'get_name';
      await msg.reply(cartText(sess.cart) + '\n\n✍️ أرسل اسمك الكامل:');
    }
    else await msg.reply('اختار 1 أو 2 أو 3\n0️⃣ رجوع');
    return;
  }

  // ===== إزالة منتج =====
  if (sess.step === 'remove_item') {
    const idx = parseInt(t) - 1;
    if (isNaN(idx) || idx < 0 || idx >= sess.cart.length) {
      await msg.reply(`❌ رقم غير صحيح! أرسل من 1 لـ ${sess.cart.length}\n0️⃣ رجوع`);
      return;
    }
    const removed = sess.cart.splice(idx, 1)[0];
    if (!sess.cart.length) {
      await msg.reply(`✅ تم حذف ${removed.emoji} ${removed.name}\n\n🛒 السلة فارغة الآن\n0️⃣ رجوع للقائمة`);
      sess.step = 'main';
    } else {
      sess.step = 'cart_menu';
      await msg.reply(`✅ تم حذف ${removed.emoji} ${removed.name}\n\n${cartMenu(sess.cart)}`);
    }
    return;
  }

  // ===== اختيار المنتج =====
  if (sess.step === 'choose_product') {
    const n = parseInt(t) - 1;
    if (isNaN(n) || !products[n]) {
      await msg.reply(`❌ رقم غير صحيح! أرسل من 1 لـ ${products.length}\n0️⃣ رجوع`);
      return;
    }
    sess.chosen = { ...products[n] };
    const priceInfo = sess.chosen.price > 0 ? `السعر: ${sess.chosen.price} ج/${sess.chosen.unit}` : '⚠️ السعر متغير - سيتم إرسال السعر إليك';
    if (sess.chosen.askWeight) {
      sess.step = 'choose_count';
      await msg.reply(`${sess.chosen.emoji} ${sess.chosen.name}\n${priceInfo}\n\n🐔 كام فرخة عايز؟\n0️⃣ رجوع`);
    } else {
      sess.step = 'choose_qty';
      await msg.reply(`${sess.chosen.emoji} ${sess.chosen.name}\n${priceInfo}\n\nكام ${sess.chosen.unit} عايز؟\n0️⃣ رجوع`);
    }
    return;
  }

  // ===== عدد الفراخ =====
  if (sess.step === 'choose_count') {
    const cnt = parseInt(t);
    if (isNaN(cnt) || cnt <= 0) { await msg.reply('❌ أدخل عدد صحيح!\n0️⃣ رجوع'); return; }
    sess.chosen._count = cnt;
    sess.step = 'choose_weight';
    await msg.reply(`⚖️ الوزن الإجمالي للـ ${cnt} فرخة (بالكيلو)؟\nمثال: 3.5\n0️⃣ رجوع`);
    return;
  }

  // ===== وزن الفراخ =====
  if (sess.step === 'choose_weight') {
    const w = parseFloat(t.replace(',', '.'));
    if (isNaN(w) || w <= 0) { await msg.reply('❌ أدخل وزن صحيح! مثال: 3.5\n0️⃣ رجوع'); return; }
    const p            = sess.chosen;
    const cnt          = p._count;
    const chickenTotal = p.price > 0 ? Math.round(p.price * w) : 0;
    const cleanTotal   = cleaningFee > 0 ? cnt * cleaningFee : 0;
    const grandTotal   = chickenTotal + cleanTotal;
    const item = { ...p, qty:cnt, weight:w, askWeight:true, wantClean:true, cleanFee:cleaningFee, cleanTotal };
    const ex = sess.cart.find(i => i.id === p.id);
    if (ex) { ex.qty += cnt; ex.weight = Math.round((ex.weight + w) * 10) / 10; ex.cleanTotal = (ex.cleanTotal || 0) + cleanTotal; }
    else sess.cart.push(item);
    sess.step = 'cart_menu';
    let reply = `✅ تم الإضافة\n\n${p.emoji} ${p.name}\n🐔 العدد: ${cnt} فرخة\n⚖️ الوزن: ${w} كيلو`;
    if (p.price > 0)     reply += `\n💰 سعر الكيلو: ${chickenTotal} ج`;
    if (cleaningFee > 0) reply += `\n🧹 نظافة (${cnt} × ${cleaningFee}): ${cleanTotal} ج`;
    reply += `\n─────────────\n💵 الإجمالي: ${grandTotal > 0 ? grandTotal+' ج' : 'سيتم الإرسال'}`;
    reply += `\n\n${cartMenu(sess.cart)}`;
    await msg.reply(reply);
    return;
  }

  // ===== كمية المنتج العادي =====
  if (sess.step === 'choose_qty') {
    const q = parseFloat(t.replace(',', '.'));
    if (isNaN(q) || q <= 0) { await msg.reply('❌ أدخل كمية صحيحة!\n0️⃣ رجوع'); return; }
    const p  = sess.chosen;
    const ex = sess.cart.find(i => i.id === p.id);
    if (ex) ex.qty += q; else sess.cart.push({ ...p, qty:q, askWeight:false });
    sess.step = 'cart_menu';
    const priceNote = p.price > 0 ? `💰 ${Math.round(q * p.price)} ج` : '⚠️ سيتم إرسال السعر إليك';
    await msg.reply(`✅ تم إضافة ${p.emoji} ${p.name} × ${q} ${p.unit}\n${priceNote}\n\n${cartMenu(sess.cart)}`);
    return;
  }

  // ===== بيانات العميل =====
  if (sess.step === 'get_name')  { sess.name    = text; sess.step = 'get_phone';   await msg.reply('📱 أرسل رقم تليفونك:'); return; }
  if (sess.step === 'get_phone') { sess.phone   = text; sess.step = 'get_address'; await msg.reply('📍 أرسل عنوانك التفصيلي:'); return; }

  if (sess.step === 'get_address') {
    sess.address    = text;
    const id        = 'ORD-' + (++orderCounter);
    const total     = sess.cart.reduce((s, i) => {
      const base = i.price > 0 ? (i.askWeight ? Math.round(i.price * i.weight) : i.price * i.qty) : 0;
      return s + base + (i.cleanTotal || 0);
    }, 0);
    const summary = sess.cart.map(i => {
      const base  = i.price > 0 ? (i.askWeight ? Math.round(i.price * i.weight) : i.price * i.qty) : 0;
      const clean = i.cleanTotal || 0;
      const qStr  = i.askWeight ? `${i.qty} فرخة / ${i.weight} كيلو${i.wantClean ? ' / نظافة ✓' : ''}` : `${i.qty} ${i.unit}`;
      let line    = `${i.emoji} ${i.name} (${qStr}) = ${(base+clean) > 0 ? (base+clean)+' ج' : 'سيتم إرسال السعر'}`;
      if (i.wantClean && clean > 0) line += `\n   🧹 ${i.qty} × ${i.cleanFee} = ${clean} ج`;
      return line;
    }).join('\n');

    try {
      await new Order({ orderId:id, name:sess.name, phone:sess.phone, address:sess.address, items:sess.cart, total }).save();
      await saveSetting('orderCounter', orderCounter);
      console.log(`✅ أوردر ${id} اتحفظ`);
    } catch(e) { console.error('❌ خطأ حفظ أوردر:', e.message); }

    const payMsg = total > 0
      ? `\n─────────────\n💳 الدفع: فودافون كاش\n📱 ${VODAFONE}\nالمبلغ: ${total} ج\n\nأو الدفع عند الاستلام`
      : '';

    await msg.reply(`✅ *تم تسجيل طلبك!*\n\n🆔 ${id}\n👤 ${sess.name}\n📱 ${sess.phone}\n📍 ${sess.address}\n\n📋 تفاصيل:\n${summary}\n\n💰 الإجمالي: ${total > 0 ? total+' ج' : 'سيتم التواصل معاك'}${payMsg}\n\n🌾 شكراً لتعاملك مع ${STORE_NAME}\n📞 للاستفسار: ${ADMIN_PHONE}`);
    sess.cart = [];
    sess.step = 'main';
    return;
  }

  // ===== تتبع طلب =====
  if (sess.step === 'track') {
    try {
      const o = await Order.findOne({ orderId: text.toUpperCase() });
      if (!o) {
        await msg.reply('❌ رقم الأوردر مش موجود!\n0️⃣ رجوع');
      } else {
        const sm = { pending:'⏳ قيد التنفيذ', done:'✅ مكتمل وجاهز للتوصيل', cancelled:'❌ ملغي' };
        await msg.reply(`🔍 تفاصيل أوردرك\n\n🆔 ${o.orderId}\n👤 ${o.name}\n📱 ${o.phone}\n📍 ${o.address}\n💰 ${o.total} ج\n\nالحالة: ${sm[o.status]}\n\n0️⃣ رجوع`);
      }
    } catch(e) {
      await msg.reply('❌ خطأ في البحث، حاول تاني\n0️⃣ رجوع');
    }
    sess.step = 'main';
    return;
  }

  await msg.reply(mainMenu());
});

// ====== تشغيل ======
client.initialize();
