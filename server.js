// Importing required libraries and modules
require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const app = express();
const port = process.env.PORT || 3001;
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
app.use(cors());

app.use(express.json());

// Creating a connection pool to the MySQL database
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  port: process.env.DB_PORT,
});

// Endpoint to retrieve a list of cards with optional filters, sorting, and pagination
app.get('/cartes', async (req, res) => {
  // Extracting query parameters from the request
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 27;
  const offset = (page - 1) * limit;
  const name = req.query.name;
  const type = req.query.type;
  const rarity = req.query.rarity;
  const sortPrice = req.query.sortPrice; // 'ASC' or 'DESC' for price sorting
  const sortAlphabetical = req.query.sortAlphabetical; // 'ASC' for alphabetical sorting

  let query = 'SELECT * FROM cartes';
  let queryParams = [];

  let whereClauses = [];
  if (name) {
    whereClauses.push('nom LIKE ?');
    queryParams.push(`%${name}%`);
  }

  if (type) {
    if (type === 'Monster Card') {
      // Includes all cards that are neither Spell Cards nor Trap Cards
      whereClauses.push("type NOT IN ('Spell Card', 'Trap Card')");
    } else {
      // For Spell Card and Trap Card, use the type as is
      whereClauses.push('type = ?');
      queryParams.push(type);
    }
  }

  if (rarity) {
    whereClauses.push('set_rarity = ?');
    queryParams.push(rarity);
  }

  if (whereClauses.length > 0) {
    query += ' WHERE ' + whereClauses.join(' AND ');
  }

  // Adding sorting logic
  if (sortAlphabetical === 'ASC') {
    query += ' ORDER BY nom ASC';
  } else if (sortPrice) {
    // Price sorting if alphabetical sorting is not requested
    query += ' ORDER BY set_price ' + (sortPrice === 'DESC' ? 'DESC' : 'ASC');
  }

  // Adding pagination
  query += ' LIMIT ? OFFSET ?';
  queryParams.push(limit, offset);

  try {
    // Creating a new connection and executing the query
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE,
    });

    const [rows] = await connection.query(query, queryParams);
    await connection.end();

    res.json(rows);
  } catch (error) {
    console.error('Error fetching cards from the database:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Endpoint to retrieve a single card by ID
app.get('/cartes/:id', async (req, res) => {
  try {
    // Creating a new connection from the pool
    const connection = await pool.getConnection();

    const { id } = req.params;
    const [rows] = await connection.query('SELECT * FROM cartes WHERE id = ?', [id]);

    // Handling the case where the card is not found
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Carte non trouvée' });
    }

    await connection.release();
    res.json(rows[0]);
  } catch (error) {
    console.error('Erreur lors de la récupération de la carte depuis la base de données:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Endpoint to delete a card by ID
app.delete('/cartes/:id', async (req, res) => {
  // Extracting user ID from the authorization header
  const authorizationHeader = req.headers.authorization;
  const userId = authorizationHeader ? authorizationHeader.split(' ')[1] : null;

  const { id } = req.params;

  try {
    // Creating a new connection from the pool
    const connection = await pool.getConnection();

    // Checking if the user is authenticated
    if (!userId) {
      return res.status(401).json({ error: 'Non autorisé' });
    }

    // Deleting the card from the database
    await connection.query('DELETE FROM cartes WHERE id = ?', [id]);
    await connection.release();

    res.json({ message: 'Carte supprimée avec succès' });
  } catch (error) {
    console.error('Erreur lors de la suppression de la carte depuis la base de données:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Endpoint to update a card by ID
app.put('/cartes/:id', async (req, res) => {
  // Extracting user ID from the authorization header
  const authorizationHeader = req.headers.authorization;
  const userId = authorizationHeader ? authorizationHeader.split(' ')[1] : null;
  const { id } = req.params;

  // Extracting card data from the request body
  const {
    nom,
    type,
    frameType,
    description,
    race,
    archetype,
    ygoprodeck_url,
    set_name,
    set_code,
    set_rarity,
    set_price,
    cardmarket_price,
    tcgplayer_price,
    ebay_price,
    amazon_price,
    coolstuffinc_price,
    image_url,
    atk,
    def,
    level,
    attribute
  } = req.body;

  try {
    // Creating a new connection from the pool
    const connection = await pool.getConnection();

    // Updating the card in the database
    await connection.query(
      'UPDATE cartes SET nom = ?, type = ?, frameType = ?, description = ?, race = ?, archetype = ?, ygoprodeck_url = ?, set_name = ?, set_code = ?, set_rarity = ?, set_price = ?, cardmarket_price = ?, tcgplayer_price = ?, ebay_price = ?, amazon_price = ?, coolstuffinc_price = ?, image_url = ?, atk = ?, def = ?, level = ?, attribute = ? WHERE id = ?',
      [
        nom,
        type,
        frameType,
        description,
        race,
        archetype,
        ygoprodeck_url,
        set_name,
        set_code,
        set_rarity,
        set_price,
        cardmarket_price,
        tcgplayer_price,
        ebay_price,
        amazon_price,
        coolstuffinc_price,
        image_url,
        atk,
        def,
        level,
        attribute,
        id
      ]
    );

    await connection.release();
    res.json({ message: 'Carte mise à jour avec succès' });
  } catch (error) {
    console.error('Erreur lors de la mise à jour de la carte dans la base de données:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Function to get the user ID from the database using the provided username and password
const getUserIdFromDatabase = async (pseudo, motDePasse) => {
  try {
    const connection = await pool.getConnection();

    const [rows] = await connection.query('SELECT id, mot_de_passe FROM utilisateur WHERE pseudo = ?', [pseudo]);

    if (rows.length === 1) {
      const hashedPassword = rows[0].mot_de_passe;
      const passwordMatch = await bcrypt.compare(motDePasse, hashedPassword);

      if (passwordMatch) {
        const userId = rows[0].id;
        console.log('ID de l\'utilisateur récupéré depuis la base de données :', userId);
        return userId;
      }
    }
    return null;
  } catch (error) {
    console.error('Erreur lors de la récupération de l\'ID de l\'utilisateur depuis la base de données:', error);
    throw error;
  }
};

// Endpoint for user login
app.post('/connexion', async (req, res) => {
  const { pseudo, mot_de_passe } = req.body;

  try {
    const connection = await pool.getConnection();

    // Querying the database to find the user with the provided username
    const [rows] = await connection.query('SELECT * FROM utilisateur WHERE pseudo = ?', [pseudo]);

    if (rows.length === 1) {
      const hashedPassword = rows[0].mot_de_passe;

      // Comparing the provided password with the hashed password from the database
      const result = await bcrypt.compare(mot_de_passe, hashedPassword);

      if (result) {
        // If the passwords match, get the user ID from the database
        const userId = await getUserIdFromDatabase(pseudo, mot_de_passe);

        if (userId) {
          // Generate a JWT token for authentication
          const token = jwt.sign({ userId }, '1Aqzsedrf!', { expiresIn: '1h' });

          res.json({ success: true, message: 'Connexion réussie', token });
        } else {
          res.status(401).json({ success: false, message: 'Identifiants incorrects' });
        }
      } else {
        res.status(401).json({ success: false, message: 'Identifiants incorrects' });
      }
    }

    await connection.release();
  } catch (error) {
    console.error('Erreur lors de la connexion :', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// Endpoint to retrieve a list of users
app.get('/utilisateurs', async (req, res) => {
  try {
    const connection = await pool.getConnection();

    // Querying the database to get the list of users
    const rows = await conn.query("SELECT id, pseudo FROM utilisateur");

    // Mapping the result to a simplified user object
    const utilisateurs = rows.map(utilisateur => {
      return {
        id: utilisateur.id,
        pseudo: utilisateur.pseudo,
      };
    });

    res.status(200).json(utilisateurs);
  } catch (err) {
    console.error("Erreur lors de la récupération des utilisateurs :", err);
    res.status(500).send("Erreur interne du serveur");
  } finally {
    if (conn) {
      connection.release();
    }
  }
});

// Endpoint to add a new user to the database
app.post('/utilisateurs', async (req, res) => {
  const { pseudo, mot_de_passe } = req.body;

  try {
    const connection = await pool.getConnection();

    // Hashing the provided password before storing it in the database
    const hashedPassword = await bcrypt.hash(mot_de_passe, 10);

    // Inserting the new user into the database
    await connection.query("INSERT INTO utilisateur (pseudo, mot_de_passe) VALUES (?, ?)", [pseudo, hashedPassword]);
    res.status(201).json({ success: true, message: "Utilisateur ajouté avec succès" });

    connection.release();
  } catch (err) {
    console.error("Erreur lors de l'ajout de l'utilisateur :", err);
    res.status(500).json({ success: false, error: "Erreur interne du serveur", details: err.message });
  }
});

// Starting the server
app.listen(port, () => {
  console.log(`Serveur démarré sur http://localhost:${port}`);
});
