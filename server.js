require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const app = express();
const port = process.env.PORT || 3001;
const cors = require('cors');
const bcrypt = require('bcrypt');
app.use(cors()); 


app.use(express.json());

app.get('/cartes', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;
  const name = req.query.name;
  const type = req.query.type;

  let query = 'SELECT * FROM cartes';
  let queryParams = [];

  // Construire la clause WHERE si nécessaire
  let whereClauses = [];
  if (name) {
    whereClauses.push('nom LIKE ?');
    queryParams.push(`%${name}%`);
  }

  if (type) {
    if (type === 'Monster Card') {
      whereClauses.push("type NOT IN ('Spell Card', 'Trap Card')");
    } else {
      whereClauses.push('type = ?');
      queryParams.push(type);
    }
  }

  if (whereClauses.length > 0) {
    query += ' WHERE ' + whereClauses.join(' AND ');
  }

  query += ' LIMIT ? OFFSET ?';
  queryParams.push(limit, offset);

  try {
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
    console.error('Erreur lors de la récupération des cartes depuis la base de données:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});


app.get('/cartes/:id', async (req, res) => {
  
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE,
    });
    const { id } = req.params;
    const [rows] = await connection.query('SELECT * FROM cartes WHERE id = ?', [id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Carte non trouvée' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('Erreur lors de la récupération de la carte depuis la base de données:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.delete('/cartes/:id', async (req, res) => {
  const authorizationHeader = req.headers.authorization;
  const userId = authorizationHeader ? authorizationHeader.split(' ')[1] : null;

  const { id } = req.params;

  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE,
    });
    if (!userId) {
      return res.status(401).json({ error: 'Non autorisé' });
    }
    await connection.query('DELETE FROM cartes WHERE id = ?', [id]);
    await connection.end();

    res.json({ message: 'Carte supprimée avec succès' });
  } catch (error) {
    console.error('Erreur lors de la suppression de la carte depuis la base de données:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.put('/cartes/:id', async (req, res) => {
  const userId = req.session.userId;
  const { id } = req.params;
  const { nom, type, description, image_url } = req.body;

  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE,
    });
    if (!userId) {
      return res.status(401).json({ error: 'Non autorisé' });
    }
    await connection.query(
      'UPDATE cartes SET nom = ?, type = ?, description = ?, image_url = ? WHERE id = ?',
      [nom, type, description, image_url, id]
    );
    await connection.end();

    res.json({ message: 'Carte mise à jour avec succès' });
  } catch (error) {
    console.error('Erreur lors de la mise à jour de la carte dans la base de données:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});
const getUserIdFromDatabase = async (pseudo, motDePasse) => {
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE,
    });

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


app.post('/connexion', async (req, res) => {
  const { pseudo, mot_de_passe } = req.body;

  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE,
    });

    const [rows] = await connection.query('SELECT * FROM utilisateur WHERE pseudo = ?', [pseudo]);

    if (rows.length === 1) {
      const hashedPassword = rows[0].mot_de_passe;

      // Utilisez bcrypt.compare avec une promesse
      const result = await new Promise((resolve, reject) => {
        bcrypt.compare(mot_de_passe, hashedPassword, (err, result) => {
          if (err) reject(err);
          resolve(result);
        });
      });

      if (result) {
        const userId = await getUserIdFromDatabase(pseudo, mot_de_passe);

        if (userId) {
          res.json({ success: true, message: `Connexion réussie. L'ID de l'utilisateur est ${userId}`, userId: userId });
        } else {
          res.status(401).json({ success: false, message: 'Identifiants incorrects' });
        }
      } else {
        res.status(401).json({ success: false, message: 'Identifiants incorrects' });
      }
    } else {
      res.status(401).json({ success: false, message: 'Identifiants incorrects' });
    }

    await connection.end();
  } catch (error) {
    console.error('Erreur lors de la connexion :', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});


  app.get('/utilisateurs', async (req, res) => {
    let conn;
    try {
        conn = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_DATABASE,
        });

        const rows = await conn.query("SELECT id, pseudo FROM utilisateur");

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
            conn.end();
        }
    }
});

app.post('/utilisateurs', async (req, res) => {
  const { pseudo, mot_de_passe } = req.body;

  try {
      const connection = await mysql.createConnection({
          host: process.env.DB_HOST,
          user: process.env.DB_USER,
          password: process.env.DB_PASSWORD,
          database: process.env.DB_DATABASE,
      });

      const hashedPassword = await bcrypt.hash(mot_de_passe, 10);

      await connection.query("INSERT INTO utilisateur (pseudo, mot_de_passe) VALUES (?, ?)", [pseudo, hashedPassword]);
      res.status(201).json({ success: true, message: "Utilisateur ajouté avec succès" });

      connection.end();
  } catch (err) {
      console.error("Erreur lors de l'ajout de l'utilisateur :", err);
      res.status(500).json({ success: false, error: "Erreur interne du serveur", details: err.message });
  }
});


app.listen(port, () => {
  console.log(`Serveur démarré sur http://localhost:${port}`);
});
