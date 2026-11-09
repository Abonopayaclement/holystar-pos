/**
 * Holy Star POS - Master Ghanaian Retail Product Catalog (catalog.js v3.3)
 * Expanded categories and clean shortened product names for fast mobile search
 * and compact product cards.
 */

const CATEGORY_VISUALS = {
  'Biscuits & Snacks': { bg1: '#f59e0b', bg2: '#b45309', emoji: '🍪' },
  'Beverages & Drinks': { bg1: '#15803d', bg2: '#14532d', emoji: '☕' },
  'Milk & Dairy': { bg1: '#0284c7', bg2: '#0369a1', emoji: '🥛' },
  'Canned & Tin Foods': { bg1: '#dc2626', bg2: '#991b1b', emoji: '🥫' },
  'Cooking Oil & Paste': { bg1: '#ea580c', bg2: '#c2410c', emoji: '🛢️' },
  'Rice, Grains & Flour': { bg1: '#ca8a04', bg2: '#854d0e', emoji: '🌾' },
  'Bread & Bakery': { bg1: '#d97706', bg2: '#92400e', emoji: '🍞' },
  'Soaps & Detergents': { bg1: '#0d9488', bg2: '#115e59', emoji: '🧼' },
  'Toiletries & Cosmetics': { bg1: '#db2777', bg2: '#9d174d', emoji: '🧴' },
  'Baby Products': { bg1: '#ec4899', bg2: '#be185d', emoji: '👶' },
  'OTC Medicine & First Aid': { bg1: '#2563eb', bg2: '#1e40af', emoji: '💊' },
  'Phone Accessories': { bg1: '#4f46e5', bg2: '#3730a3', emoji: '🔌' },
  'Stationery': { bg1: '#6366f1', bg2: '#4338ca', emoji: '📚' },
  'Household & Plastics': { bg1: '#0891b2', bg2: '#0e7490', emoji: '🪣' }
};

/**
 * Generates a crisp SVG data-URI thumbnail for any catalog or custom product
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
  // 1. Biscuits & Snacks
  { name: 'Digestive Biscuit', category: 'Biscuits & Snacks', cost_price: 6.5, selling_price: 8.5, barcode: '6031100100010' },
  { name: 'Hobnobs Biscuit', category: 'Biscuits & Snacks', cost_price: 7.0, selling_price: 9.0, barcode: '6031100100027' },
  { name: 'Perk Biscuit', category: 'Biscuits & Snacks', cost_price: 3.5, selling_price: 5.0, barcode: '6031100100034' },
  { name: 'Butter Cookies', category: 'Biscuits & Snacks', cost_price: 28.0, selling_price: 35.0, barcode: '6031100100041' },
  { name: 'Oreo 133g', category: 'Biscuits & Snacks', cost_price: 8.0, selling_price: 11.0, barcode: '6031100100072' },
  { name: 'Cabin Biscuit', category: 'Biscuits & Snacks', cost_price: 4.0, selling_price: 6.0, barcode: '6031100100096' },
  { name: 'Pringles 165g', category: 'Biscuits & Snacks', cost_price: 22.0, selling_price: 28.0, barcode: '6031100100119' },

  // 2. Beverages & Drinks
  { name: 'Milo 400g', category: 'Beverages & Drinks', cost_price: 28.0, selling_price: 35.0, barcode: '6031100200017' },
  { name: 'Milo Sachet', category: 'Beverages & Drinks', cost_price: 2.2, selling_price: 3.0, barcode: '6031100200031' },
  { name: 'Nescafe 3-in-1', category: 'Beverages & Drinks', cost_price: 2.5, selling_price: 3.5, barcode: '6031100200048' },
  { name: 'Bournvita 400g', category: 'Beverages & Drinks', cost_price: 26.0, selling_price: 33.0, barcode: '6031100200079' },
  { name: 'Lipton Tea', category: 'Beverages & Drinks', cost_price: 12.0, selling_price: 16.0, barcode: '6031100200086' },
  { name: 'Malta Guinness', category: 'Beverages & Drinks', cost_price: 6.0, selling_price: 8.0, barcode: '6031100200109' },
  { name: 'Coke 500ml', category: 'Beverages & Drinks', cost_price: 4.5, selling_price: 6.0, barcode: '6031100200116' },
  { name: 'Bel-Aqua 500ml', category: 'Beverages & Drinks', cost_price: 2.0, selling_price: 3.0, barcode: '6031100200123' },

  // 3. Milk & Dairy
  { name: 'Ideal Milk', category: 'Milk & Dairy', cost_price: 7.0, selling_price: 9.0, barcode: '6031100300014' },
  { name: 'Carnation Milk', category: 'Milk & Dairy', cost_price: 6.5, selling_price: 8.5, barcode: '6031100300021' },
  { name: 'Peak Tin Milk', category: 'Milk & Dairy', cost_price: 7.5, selling_price: 9.5, barcode: '6031100300038' },
  { name: 'Peak Sachet', category: 'Milk & Dairy', cost_price: 2.5, selling_price: 3.5, barcode: '6031100300045' },
  { name: 'Nido 400g', category: 'Milk & Dairy', cost_price: 32.0, selling_price: 40.0, barcode: '6031100300052' },
  { name: 'Cowbell Sachet', category: 'Milk & Dairy', cost_price: 2.0, selling_price: 3.0, barcode: '6031100300069' },
  { name: 'Blue Band 250g', category: 'Milk & Dairy', cost_price: 14.0, selling_price: 18.0, barcode: '6031100300083' },

  // 4. Canned & Tin Foods
  { name: 'Gino Paste', category: 'Canned & Tin Foods', cost_price: 2.5, selling_price: 3.5, barcode: '6031100400011' },
  { name: 'Gino 400g', category: 'Canned & Tin Foods', cost_price: 14.0, selling_price: 18.0, barcode: '6031100400028' },
  { name: 'Tasty Tom 70g', category: 'Canned & Tin Foods', cost_price: 2.2, selling_price: 3.0, barcode: '6031100400035' },
  { name: 'Titus Sardines', category: 'Canned & Tin Foods', cost_price: 10.0, selling_price: 13.0, barcode: '6031100400059' },
  { name: 'Geisha Mackerel', category: 'Canned & Tin Foods', cost_price: 11.0, selling_price: 14.0, barcode: '6031100400066' },
  { name: 'Corned Beef', category: 'Canned & Tin Foods', cost_price: 24.0, selling_price: 30.0, barcode: '6031100400073' },
  { name: 'Baked Beans', category: 'Canned & Tin Foods', cost_price: 12.0, selling_price: 16.0, barcode: '6031100400080' },

  // 5. Cooking Oil & Paste
  { name: 'Frytol 1L', category: 'Cooking Oil & Paste', cost_price: 28.0, selling_price: 35.0, barcode: '6031100500018' },
  { name: 'Frytol 5L', category: 'Cooking Oil & Paste', cost_price: 130.0, selling_price: 155.0, barcode: '6031100500025' },
  { name: 'Gino Oil 1L', category: 'Cooking Oil & Paste', cost_price: 26.0, selling_price: 32.0, barcode: '6031100500026' },
  { name: 'Mayor Oil 1L', category: 'Cooking Oil & Paste', cost_price: 25.0, selling_price: 31.0, barcode: '6031100500027' },

  // 6. Rice, Grains & Flour
  { name: 'Cindy Rice 5kg', category: 'Rice, Grains & Flour', cost_price: 65.0, selling_price: 78.0, barcode: '6031100500032' },
  { name: 'Lele Rice 5kg', category: 'Rice, Grains & Flour', cost_price: 68.0, selling_price: 82.0, barcode: '6031100500049' },
  { name: 'Sugar 1kg', category: 'Rice, Grains & Flour', cost_price: 18.0, selling_price: 22.0, barcode: '6031100500056' },
  { name: 'Indomie Onion', category: 'Rice, Grains & Flour', cost_price: 3.5, selling_price: 5.0, barcode: '6031100500063' },
  { name: 'Indomie Jollof', category: 'Rice, Grains & Flour', cost_price: 3.8, selling_price: 5.0, barcode: '6031100500070' },
  { name: 'Maggi Cube', category: 'Rice, Grains & Flour', cost_price: 0.5, selling_price: 1.0, barcode: '6031100500094' },
  { name: 'Annapurna Salt', category: 'Rice, Grains & Flour', cost_price: 3.5, selling_price: 5.0, barcode: '6031100500100' },

  // 7. Bread & Bakery
  { name: 'Butter Bread', category: 'Bread & Bakery', cost_price: 12.0, selling_price: 15.0, barcode: '6031100600101' },
  { name: 'Sugar Bread', category: 'Bread & Bakery', cost_price: 10.0, selling_price: 13.0, barcode: '6031100600102' },
  { name: 'Meat Pie', category: 'Bread & Bakery', cost_price: 6.0, selling_price: 8.0, barcode: '6031100600103' },
  { name: 'Cake Slice', category: 'Bread & Bakery', cost_price: 5.0, selling_price: 7.0, barcode: '6031100600104' },

  // 8. Soaps & Detergents
  { name: 'Geisha Soap', category: 'Soaps & Detergents', cost_price: 5.0, selling_price: 7.0, barcode: '6031100600015' },
  { name: 'Key Soap Bar', category: 'Soaps & Detergents', cost_price: 8.0, selling_price: 10.0, barcode: '6031100600022' },
  { name: 'Sunlight 1kg', category: 'Soaps & Detergents', cost_price: 22.0, selling_price: 27.0, barcode: '6031100600053' },
  { name: 'Omo 900g', category: 'Soaps & Detergents', cost_price: 24.0, selling_price: 30.0, barcode: '6031100600060' },
  { name: 'Camel Antiseptic', category: 'Soaps & Detergents', cost_price: 6.5, selling_price: 9.0, barcode: '6031100600077' },
  { name: 'Parazone 1L', category: 'Soaps & Detergents', cost_price: 14.0, selling_price: 18.0, barcode: '6031100600084' },

  // 9. Toiletries & Cosmetics
  { name: 'Pepsodent', category: 'Toiletries & Cosmetics', cost_price: 8.0, selling_price: 11.0, barcode: '6031100600039' },
  { name: 'CloseUp Gel', category: 'Toiletries & Cosmetics', cost_price: 9.0, selling_price: 12.0, barcode: '6031100600046' },
  { name: 'Toilet Roll', category: 'Toiletries & Cosmetics', cost_price: 2.5, selling_price: 4.0, barcode: '6031100600091' },
  { name: 'Vaseline 100ml', category: 'Toiletries & Cosmetics', cost_price: 10.0, selling_price: 13.0, barcode: '6031100800019' },
  { name: 'Nivea Lotion', category: 'Toiletries & Cosmetics', cost_price: 38.0, selling_price: 48.0, barcode: '6031100800026' },
  { name: 'Sure Deodorant', category: 'Toiletries & Cosmetics', cost_price: 18.0, selling_price: 24.0, barcode: '6031100800033' },
  { name: 'Shea Butter', category: 'Toiletries & Cosmetics', cost_price: 8.0, selling_price: 12.0, barcode: '6031100800040' },

  // 10. Baby Products
  { name: 'Baby Diapers M', category: 'Baby Products', cost_price: 45.0, selling_price: 55.0, barcode: '6031101000015' },
  { name: 'Baby Wipes', category: 'Baby Products', cost_price: 14.0, selling_price: 18.0, barcode: '6031101000022' },
  { name: 'Cussons Baby Oil', category: 'Baby Products', cost_price: 18.0, selling_price: 24.0, barcode: '6031101000039' },
  { name: 'Cerelac 400g', category: 'Baby Products', cost_price: 36.0, selling_price: 44.0, barcode: '6031101000046' },

  // 11. OTC Medicine & First Aid
  { name: 'Paracetamol', category: 'OTC Medicine & First Aid', cost_price: 2.0, selling_price: 3.5, barcode: '6031100700012' },
  { name: 'Gebedol Strip', category: 'OTC Medicine & First Aid', cost_price: 3.0, selling_price: 5.0, barcode: '6031100700029' },
  { name: 'Vitamin C', category: 'OTC Medicine & First Aid', cost_price: 2.5, selling_price: 4.0, barcode: '6031100700036' },
  { name: 'ORS Sachet', category: 'OTC Medicine & First Aid', cost_price: 2.0, selling_price: 3.0, barcode: '6031100700043' },
  { name: 'Robb Ointment', category: 'OTC Medicine & First Aid', cost_price: 5.0, selling_price: 7.0, barcode: '6031100700050' },
  { name: 'Methylated Spirit', category: 'OTC Medicine & First Aid', cost_price: 8.0, selling_price: 11.0, barcode: '6031100700067' },

  // 12. Phone Accessories
  { name: 'Type-C Cable', category: 'Phone Accessories', cost_price: 12.0, selling_price: 20.0, barcode: '6031100900016' },
  { name: 'Fast Charger 20W', category: 'Phone Accessories', cost_price: 30.0, selling_price: 45.0, barcode: '6031100900017' },
  { name: 'Micro-USB Cable', category: 'Phone Accessories', cost_price: 10.0, selling_price: 18.0, barcode: '6031100900023' },
  { name: 'Oraimo Earphones', category: 'Phone Accessories', cost_price: 22.0, selling_price: 35.0, barcode: '6031100900030' },
  { name: 'Power Bank 10k', category: 'Phone Accessories', cost_price: 110.0, selling_price: 140.0, barcode: '6031100900047' },
  { name: 'AA Batteries', category: 'Phone Accessories', cost_price: 4.0, selling_price: 6.0, barcode: '6031100900054' },

  // 13. Stationery
  { name: 'A4 Paper Ream', category: 'Stationery', cost_price: 55.0, selling_price: 70.0, barcode: '6031101100012' },
  { name: 'Bic Pen (Blue)', category: 'Stationery', cost_price: 1.5, selling_price: 2.5, barcode: '6031101100029' },
  { name: 'Exercise Book', category: 'Stationery', cost_price: 3.0, selling_price: 4.5, barcode: '6031101100036' },
  { name: 'Permanent Marker', category: 'Stationery', cost_price: 4.0, selling_price: 6.0, barcode: '6031101100043' },

  // 14. Household & Plastics
  { name: 'Plastic Bucket', category: 'Household & Plastics', cost_price: 16.0, selling_price: 22.0, barcode: '6031101200019' },
  { name: 'Plastic Basin', category: 'Household & Plastics', cost_price: 14.0, selling_price: 20.0, barcode: '6031101200026' },
  { name: 'Broom & Dustpan', category: 'Household & Plastics', cost_price: 18.0, selling_price: 25.0, barcode: '6031101200033' }
];

window.MASTER_CATALOG = RAW_MASTER_CATALOG.map((item, idx) => ({
  catalog_id: 'CAT-' + String(idx + 1).padStart(3, '0'),
  name: item.name,
  category: item.category,
  cost_price: item.cost_price,
  selling_price: item.selling_price,
  suggested_barcode: item.barcode,
  image_url: generateProductSvgThumbnail(item.name, item.category)
}));

window.generateProductSvgThumbnail = generateProductSvgThumbnail;
