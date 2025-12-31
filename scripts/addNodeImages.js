const fs = require('fs');
const path = require('path');

/**
 * Adds representative image URLs to nodes in hsitp_locationGraph.json.
 * Existing image fields are preserved.
 */
const locationGraphPath = path.join(__dirname, '../server/data/hsitp_locationGraph.json');

const baseImages = {
  buildingExterior: 'https://images.unsplash.com/photo-1479839672679-a46483c0e7c8?auto=format&fit=crop&w=1200&q=80',
  reception: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=1200&q=80',
  lobby: 'https://images.unsplash.com/photo-1497366858526-0766cadbe8fa?auto=format&fit=crop&w=1200&q=80',
  liftLobby: 'https://images.unsplash.com/photo-1505691723518-36a5ac3be353?auto=format&fit=crop&w=1200&q=80',
  corridor: 'https://images.unsplash.com/photo-1502673530728-f79b4cab31b1?auto=format&fit=crop&w=1200&q=80',
  pantry: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1200&q=80',
  femaleLav: 'https://images.unsplash.com/photo-1503023345310-bd7c1de61c7d?auto=format&fit=crop&w=900&q=80',
  maleLav: 'https://images.unsplash.com/photo-1449247709967-d4461a6a6103?auto=format&fit=crop&w=900&q=80',
  utility: 'https://images.unsplash.com/photo-1523419409543-0c1df022bddb?auto=format&fit=crop&w=1200&q=80',
  stairs: 'https://images.unsplash.com/photo-1508609349937-5ec4ae374ebf?auto=format&fit=crop&w=1000&q=80'
};

const zoneImages = {
  '01': 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80',
  '02': 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80',
  '03': 'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1200&q=80',
  '05': 'https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=1200&q=80',
  '06': 'https://images.unsplash.com/photo-1526481280695-3c4697f19c6b?auto=format&fit=crop&w=1200&q=80',
  '07': 'https://images.unsplash.com/photo-1520880867055-1e30d1cb001c?auto=format&fit=crop&w=1200&q=80'
};

const nodeSpecificImages = {
  hsitp_main_entrance: baseImages.buildingExterior,
  hsitp_reception: baseImages.reception,
  hsitp_lobby: baseImages.lobby,
  hsitp_lift_lobby: baseImages.liftLobby,
  hsitp_lift_lobby_1: baseImages.liftLobby,
  hsitp_lift_lobby_2: baseImages.liftLobby,
  hsitp_lift_lobby_3: baseImages.liftLobby,
  hsitp_lift_lobby_5: baseImages.liftLobby,
  hsitp_lift_lobby_6: baseImages.liftLobby,
  hsitp_lift_lobby_7: baseImages.liftLobby,
  hsitp_corridor_1: baseImages.corridor,
  hsitp_corridor_2: baseImages.corridor,
  hsitp_corridor_3: baseImages.corridor,
  hsitp_corridor_5: baseImages.corridor,
  hsitp_corridor_6: baseImages.corridor,
  hsitp_corridor_7: baseImages.corridor,
  hsitp_common_pantry_1: baseImages.pantry,
  hsitp_common_pantry_2: baseImages.pantry,
  hsitp_common_pantry_3: baseImages.pantry,
  hsitp_common_pantry_5: baseImages.pantry,
  hsitp_common_pantry_6: baseImages.pantry,
  hsitp_common_pantry_7: baseImages.pantry,
  hsitp_stairs_main: baseImages.stairs,
  hsitp_stairs_1: baseImages.stairs,
  hsitp_stairs_2: baseImages.stairs,
  hsitp_stairs_3: baseImages.stairs,
  hsitp_stairs_5: baseImages.stairs,
  hsitp_stairs_6: baseImages.stairs,
  hsitp_stairs_7: baseImages.stairs
};

function getZoneImage(nodeId) {
  const match = nodeId.match(/zone_(\d{2})/i);
  if (match) {
    const code = match[1];
    return zoneImages[code] || null;
  }
  return null;
}

function getServiceImage(node) {
  const id = node.id.toLowerCase();
  const name = node.name.toLowerCase();

  if (id.includes('lav_f') || name.includes('female') || name.includes('women')) {
    return baseImages.femaleLav;
  }
  if (id.includes('lav_m') || name.includes('male') || name.includes('men')) {
    return baseImages.maleLav;
  }
  if (id.includes('restroom_gf_f')) {
    return baseImages.femaleLav;
  }
  if (id.includes('restroom_gf_m')) {
    return baseImages.maleLav;
  }
  if (id.includes('lift_lobby')) {
    return baseImages.liftLobby;
  }
  if (id.includes('pantry')) {
    return baseImages.pantry;
  }
  if (id.includes('corridor')) {
    return baseImages.corridor;
  }
  if (id.includes('ahu') || id.includes('meter') || id.includes('tel_equip')) {
    return baseImages.utility;
  }
  return null;
}

function addImages() {
  const graph = JSON.parse(fs.readFileSync(locationGraphPath, 'utf8'));
  let updated = 0;

  graph.nodes = graph.nodes.map(node => {
    if (node.image) {
      return node; // keep existing
    }

    let image = nodeSpecificImages[node.id];
    if (!image) {
      image = getZoneImage(node.id) || getServiceImage(node);
    }

    if (image) {
      updated += 1;
      return { ...node, image };
    }
    return node;
  });

  fs.writeFileSync(locationGraphPath, JSON.stringify(graph, null, 2), 'utf8');
  console.log(`✅ Added images to ${updated} nodes`);
}

addImages();

