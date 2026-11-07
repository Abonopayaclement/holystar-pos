/**
 * Holy Star POS - Master Ghanaian Retail Product Catalog (catalog.js)
 * Read-only autocomplete database of 65+ common Ghanaian retail products
 * across Biscuits, Beverages, Milk & Dairy, Tin & Canned Foods, Grains & Oils,
 * Toiletries & Household, Pharmacy/OTC, Cosmetics, and Phone Accessories.
 */

const CATEGORY_VISUALS = {
  'Biscuits & Snacks': { bg1: '#f59e0b', bg2: '#b45309', emoji: '🍪' },
  'Beverages': { bg1: '#15803d', bg2: '#14532d', emoji: '☕' },
  'Milk & Dairy': { bg1: '#0284c7', bg2: '#0369a1', emoji: '🥛' },
  'Tin & Canned Foods': { bg1: '#dc2626', bg2: '#991b1b', emoji: '🥫' },
  'Grains & Oils': { bg1: '#ca8a04', bg2: '#854d0e', emoji: '🌾' },
  'Toiletries & Household': { bg1: '#0d9488', bg2: '#115e59', emoji: '🧼' },
  'Pharmacy / OTC': { bg1: '#2563eb', bg2: '#1e40af', emoji: '💊' },
  'Cosmetics & Beauty': { bg1: '#db2777', bg2: '#9d174d', emoji: '🧴' },
  'Phone & Electronics': { bg1: '#4f46e5', bg2: '#3730a3', emoji: '🔌' }
};

/**
 * Generates a crisp SVG data-URI thumbnail for any catalog or custom product
 * when a custom camera photo is not uploaded.
 */
function generateProductSvgThumbnail(name, category) {
  const style = CATEGORY_VISUALS[category] || { bg1: '#334155', bg2: '#0f172a', emoji: '📦' };
  const cleanName = String(name || 'Item').trim();
  const initials = cleanName
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');

  const shortTitle = cleanName.length > 14 ? cleanName.slice(0, 13) + '…' : cleanName;
  const safeTitle = shortTitle.replace(/[<>&"']/g, '');
  const safeInitials = initials.replace(/[<>&"']/g, '');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${style.bg1}"/>
        <stop offset="100%" stop-color="${style.bg2}"/>
      </linearGradient>
    </defs>
    <rect width="120" height="120" rx="20" fill="url(#g)"/>
    <circle cx="60" cy="46" r="26" fill="rgba(255,255,255,0.16)"/>
    <text x="60" y="55" font-family="Segoe UI Emoji, Arial, sans-serif" font-size="28" text-anchor="middle" fill="#fff">${style.emoji}</text>
    <text x="98" y="24" font-family="Arial, sans-serif" font-size="11" font-weight="800" text-anchor="end" fill="rgba(255,255,255,0.75)">${safeInitials}</text>
    <rect x="8" y="82" width="104" height="28" rx="8" fill="rgba(15,23,42,0.55)"/>
    <text x="60" y="100" font-family="Arial, sans-serif" font-size="11" font-weight="700" text-anchor="middle" fill="#ffffff">${safeTitle}</text>
  </svg>`;

  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

const RAW_MASTER_CATALOG = [
  // 1. BISCUITS & SNACKS
  { name: "McVitie's Digestive Biscuit 105g", category: 'Biscuits & Snacks', suggested_barcode: '6031100100010' },
  { name: "McVitie's Hobnobs Oat Biscuit", category: 'Biscuits & Snacks', suggested_barcode: '6031100100027' },
  { name: 'Perk Milk Shortcake Biscuit', category: 'Biscuits & Snacks', suggested_barcode: '6031100100034' },
  { name: 'Royal Dansk Butter Cookies Tin 400g', category: 'Biscuits & Snacks', suggested_barcode: '6031100100041' },
  { name: 'Piccadilly Sweet Biscuit Pack', category: 'Biscuits & Snacks', suggested_barcode: '6031100100058' },
  { name: 'King Cracker Cream Biscuit', category: 'Biscuits & Snacks', suggested_barcode: '6031100100065' },
  { name: 'Oreo Original Vanilla Biscuit 133g', category: 'Biscuits & Snacks', suggested_barcode: '6031100100072' },
  { name: 'Parle-G Original Glucose Biscuit', category: 'Biscuits & Snacks', suggested_barcode: '6031100100089' },
  { name: 'Cabin Sweet Hard Biscuit Pack', category: 'Biscuits & Snacks', suggested_barcode: '6031100100096' },
  { name: 'NutriSnax Marie Milk Biscuit', category: 'Biscuits & Snacks', suggested_barcode: '6031100100102' },
  { name: 'Pringles Original Crisps 165g', category: 'Biscuits & Snacks', suggested_barcode: '6031100100119' },

  // 2. BEVERAGES
  { name: 'Nestle Milo Activ-Go Tin 400g', category: 'Beverages', suggested_barcode: '6031100200017' },
  { name: 'Nestle Milo Activ-Go Refill Pouch 400g', category: 'Beverages', suggested_barcode: '6031100200024' },
  { name: 'Nestle Milo Sachet 20g', category: 'Beverages', suggested_barcode: '6031100200031' },
  { name: 'Nescafe 3-in-1 Breakfast Sachet', category: 'Beverages', suggested_barcode: '6031100200048' },
  { name: 'Nescafe Classic Instant Coffee 50g Tin', category: 'Beverages', suggested_barcode: '6031100200055' },
  { name: 'Ovaltine Malted Food Drink 400g Tin', category: 'Beverages', suggested_barcode: '6031100200062' },
  { name: 'Cadbury Bournvita 400g Jar', category: 'Beverages', suggested_barcode: '6031100200079' },
  { name: 'Lipton Yellow Label Tea (25 Teabags)', category: 'Beverages', suggested_barcode: '6031100200086' },
  { name: 'Cowbell Strawberry Flavoured Drink Sachet', category: 'Beverages', suggested_barcode: '6031100200093' },
  { name: 'Malta Guinness Non-Alcoholic Can 330ml', category: 'Beverages', suggested_barcode: '6031100200109' },
  { name: 'Coca-Cola PET Bottle 500ml', category: 'Beverages', suggested_barcode: '6031100200116' },
  { name: 'Bel-Aqua Natural Mineral Water 500ml', category: 'Beverages', suggested_barcode: '6031100200123' },

  // 3. MILK & DAIRY
  { name: 'Ideal Evaporated Milk 160g Tin', category: 'Milk & Dairy', suggested_barcode: '6031100300014' },
  { name: 'Carnation Evaporated Milk 160g Tin', category: 'Milk & Dairy', suggested_barcode: '6031100300021' },
  { name: 'Peak Evaporated Milk 160g Tin', category: 'Milk & Dairy', suggested_barcode: '6031100300038' },
  { name: 'Peak Full Cream Powdered Milk Sachet 30g', category: 'Milk & Dairy', suggested_barcode: '6031100300045' },
  { name: 'Nestle Nido Milk Powder Tin 400g', category: 'Milk & Dairy', suggested_barcode: '6031100300052' },
  { name: 'Cowbell Full Cream Milk Sachet 35g', category: 'Milk & Dairy', suggested_barcode: '6031100300069' },
  { name: 'Dano Full Cream Milk Powder Sachet', category: 'Milk & Dairy', suggested_barcode: '6031100300076' },
  { name: 'Blue Band Margarine Tub 250g', category: 'Milk & Dairy', suggested_barcode: '6031100300083' },

  // 4. TIN & CANNED FOODS
  { name: 'Gino Tomato Paste Mix 70g Sachet', category: 'Tin & Canned Foods', suggested_barcode: '6031100400011' },
  { name: 'Gino Tomato Paste Tin 400g', category: 'Tin & Canned Foods', suggested_barcode: '6031100400028' },
  { name: 'Tasty Tom Enriched Tomato Mix Sachet 70g', category: 'Tin & Canned Foods', suggested_barcode: '6031100400035' },
  { name: 'Pomo Tomato Paste Sachet 70g', category: 'Tin & Canned Foods', suggested_barcode: '6031100400042' },
  { name: 'Titus Sardines in Vegetable Oil 125g', category: 'Tin & Canned Foods', suggested_barcode: '6031100400059' },
  { name: 'Geisha Mackerel in Tomato Sauce 155g', category: 'Tin & Canned Foods', suggested_barcode: '6031100400066' },
  { name: 'Exeter Corned Beef 340g Tin', category: 'Tin & Canned Foods', suggested_barcode: '6031100400073' },
  { name: 'Heinz Baked Beans in Tomato Sauce 415g', category: 'Tin & Canned Foods', suggested_barcode: '6031100400080' },

  // 5. GRAINS & OILS
  { name: 'Frytol Vegetable Cooking Oil 1 Litre', category: 'Grains & Oils', suggested_barcode: '6031100500018' },
  { name: 'Frytol Vegetable Cooking Oil 5 Litres Gallon', category: 'Grains & Oils', suggested_barcode: '6031100500025' },
  { name: 'Cindy Jasmine Long Grain Rice 5kg', category: 'Grains & Oils', suggested_barcode: '6031100500032' },
  { name: 'Lele Royal Perfume Rice 5kg Bag', category: 'Grains & Oils', suggested_barcode: '6031100500049' },
  { name: 'White Granulated Sugar 1kg Pack', category: 'Grains & Oils', suggested_barcode: '6031100500056' },
  { name: 'Indomie Instant Noodles Onion Chicken 70g', category: 'Grains & Oils', suggested_barcode: '6031100500063' },
  { name: 'Indomie Instant Jollof Noodles 70g', category: 'Grains & Oils', suggested_barcode: '6031100500070' },
  { name: 'Onga Classic Stew Seasoning Tablet', category: 'Grains & Oils', suggested_barcode: '6031100500087' },
  { name: 'Maggi Shrimp Seasoning Cube Pack', category: 'Grains & Oils', suggested_barcode: '6031100500094' },
  { name: 'Annapurna Iodised Salt 500g Pack', category: 'Grains & Oils', suggested_barcode: '6031100500100' },

  // 6. TOILETRIES & HOUSEHOLD
  { name: 'Geisha Long Lasting Bath Soap 125g', category: 'Toiletries & Household', suggested_barcode: '6031100600015' },
  { name: 'Key Soap Multipurpose Long Bar', category: 'Toiletries & Household', suggested_barcode: '6031100600022' },
  { name: 'Pepsodent Cavity Fighter Toothpaste 140g', category: 'Toiletries & Household', suggested_barcode: '6031100600039' },
  { name: 'CloseUp Red Hot Gel Toothpaste 130g', category: 'Toiletries & Household', suggested_barcode: '6031100600046' },
  { name: 'Sunlight 2-in-1 Washing Powder 1kg', category: 'Toiletries & Household', suggested_barcode: '6031100600053' },
  { name: 'Omo Fast Action Detergent Powder 900g', category: 'Toiletries & Household', suggested_barcode: '6031100600060' },
  { name: 'Camel Antiseptic Medicated Soap 85g', category: 'Toiletries & Household', suggested_barcode: '6031100600077' },
  { name: 'Parazone Thick Household Bleach 1L', category: 'Toiletries & Household', suggested_barcode: '6031100600084' },
  { name: 'Rose Soft Toilet Tissue Roll (Single)', category: 'Toiletries & Household', suggested_barcode: '6031100600091' },

  // 7. PHARMACY / OVER-THE-COUNTER
  { name: 'Paracetamol 500mg Tablets (10-Tab Strip)', category: 'Pharmacy / OTC', suggested_barcode: '6031100700012' },
  { name: 'Gebedol Extra Pain Relief Strip', category: 'Pharmacy / OTC', suggested_barcode: '6031100700029' },
  { name: 'Vitamin C 100mg Chewable Strip', category: 'Pharmacy / OTC', suggested_barcode: '6031100700036' },
  { name: 'ORS Oral Rehydration Salts Sachet', category: 'Pharmacy / OTC', suggested_barcode: '6031100700043' },
  { name: 'Robb Menthol Soothing Ointment Tin', category: 'Pharmacy / OTC', suggested_barcode: '6031100700050' },
  { name: 'Methylated Spirit Antiseptic 100ml', category: 'Pharmacy / OTC', suggested_barcode: '6031100700067' },

  // 8. COSMETICS & BEAUTY
  { name: 'Vaseline Blue Seal Petroleum Jelly 100ml', category: 'Cosmetics & Beauty', suggested_barcode: '6031100800019' },
  { name: 'Nivea Nourishing Cocoa Body Lotion 400ml', category: 'Cosmetics & Beauty', suggested_barcode: '6031100800026' },
  { name: 'Sure Invisible Aqua Roll-On Deodorant', category: 'Cosmetics & Beauty', suggested_barcode: '6031100800033' },
  { name: 'Pure Unrefined Northern Shea Butter Tub', category: 'Cosmetics & Beauty', suggested_barcode: '6031100800040' },
  { name: 'Dark and Lovely No-Lye Relaxer Kit', category: 'Cosmetics & Beauty', suggested_barcode: '6031100800057' },

  // 9. PHONE & ELECTRONICS
  { name: 'Type-C 20W Super Fast Wall Charger', category: 'Phone & Electronics', suggested_barcode: '6031100900016' },
  { name: 'Micro-USB Android Charging Cable 1m', category: 'Phone & Electronics', suggested_barcode: '6031100900023' },
  { name: 'Oraimo Bass In-Ear Wired Earphones', category: 'Phone & Electronics', suggested_barcode: '6031100900030' },
  { name: 'Oraimo 10000mAh Dual-Port Power Bank', category: 'Phone & Electronics', suggested_barcode: '6031100900047' },
  { name: 'Tiger Head AA Dry Cell Batteries (Pair)', category: 'Phone & Electronics', suggested_barcode: '6031100900054' }
];

window.MASTER_CATALOG = RAW_MASTER_CATALOG.map((item, idx) => ({
  catalog_id: 'CAT-' + String(idx + 1).padStart(3, '0'),
  name: item.name,
  category: item.category,
  suggested_barcode: item.suggested_barcode,
  image_url: generateProductSvgThumbnail(item.name, item.category)
}));

window.generateProductSvgThumbnail = generateProductSvgThumbnail;
