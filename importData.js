const axios = require('axios');
const mysql = require('mysql2/promise');

async function fetchDataFromAPI() {
  try {
    const response = await axios.get('https://db.ygoprodeck.com/api/v7/cardinfo.php');
    const cardData = response.data.data;
    await insertDataIntoDatabase(cardData);
  } catch (error) {
    console.error('Erreur lors de la récupération des données depuis l API:', error);
  }
}

async function insertDataIntoDatabase(cardData) {
    const connection = await mysql.createConnection({
      host: 'localhost',
      user: 'yugi_root',
      password: 'password',
      database: 'yugi_db',
    });
  
    try {
        for (const card of cardData) {
            const image_url = card.card_images && card.card_images[0] ? card.card_images[0].image_url : null;
          
            const setInfo = card.card_sets && card.card_sets.length > 0 ? card.card_sets[0] : {};
            const priceInfo = card.card_prices && card.card_prices.length > 0 ? card.card_prices[0] : {};
          
            await connection.query(`
              INSERT INTO cartes (
                nom, type, frameType, description, race, archetype, ygoprodeck_url,
                set_name, set_code, set_rarity, set_price, cardmarket_price, tcgplayer_price,
                ebay_price, amazon_price, coolstuffinc_price, image_url, atk, def, level, attribute
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
              card.name, card.type, card.frameType, card.desc, card.race,
              card.archetype, card.ygoprodeck_url, setInfo.set_name || null,
              setInfo.set_code || null, setInfo.set_rarity || null,
              setInfo.set_price || null, priceInfo.cardmarket_price || null,
              priceInfo.tcgplayer_price || null, priceInfo.ebay_price || null,
              priceInfo.amazon_price || null, priceInfo.coolstuffinc_price || null,
              image_url, card.atk || null, card.def || null, card.level || null,
              card.attribute || null
            ]);
          }
  
      console.log('Données insérées avec succès dans la base de données.');
    } catch (error) {
      console.error('Erreur lors de l\'insertion des données dans la base de données:', error);
    } finally {
      await connection.end();
    }
}

fetchDataFromAPI();
