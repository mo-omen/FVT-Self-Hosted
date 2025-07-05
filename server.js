// This is the backend server that runs on your Debian machine.
// This version is modified to serve index.html from the project root and handle data import/export.
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const cors = require('cors');
const multer = require('multer');

const app = express();
const port = 4087;

// --- FILE PATHS ---
// All paths are relative to the location of this server.js file.
const DB_PATH = path.join(__dirname, 'data');
const APPLICANTS_FILE = path.join(DB_PATH, 'applicants.json');
const SETTINGS_FILE = path.join(DB_PATH, 'settings.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// --- MIDDLEWARE ---
app.use(cors()); // Allow requests from the front-end
app.use(express.json({ limit: '10mb' })); // Parse JSON bodies, increase limit for import
app.use(express.urlencoded({ extended: true, limit: '10mb' }));


// Serve uploaded files statically from the /uploads directory
app.use('/uploads', express.static(UPLOADS_DIR));

// --- DATABASE HELPER FUNCTIONS ---
const readDB = async (filePath) => JSON.parse(await fs.readFile(filePath, 'utf-8'));
const writeDB = async (filePath, data) => fs.writeFile(filePath, JSON.stringify(data, null, 2));

// --- MULTER SETUP FOR FILE UPLOADS ---
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, UPLOADS_DIR);
    },
    filename: function (req, file, cb) {
        // Create a unique filename to avoid conflicts
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// --- API ROUTES ---

// GET Settings
app.get('/api/settings', async (req, res) => {
    try {
        const settings = await readDB(SETTINGS_FILE);
        res.json(settings);
    } catch (error) {
        res.status(500).json({ error: 'Failed to read settings.' });
    }
});

// POST (Update) Settings
app.post('/api/settings', async (req, res) => {
    try {
        await writeDB(SETTINGS_FILE, req.body);
        res.json(req.body);
    } catch (error) {
        res.status(500).json({ error: 'Failed to save settings.' });
    }
});

// GET all Applicants
app.get('/api/applicants', async (req, res) => {
    try {
        const applicants = await readDB(APPLICANTS_FILE);
        res.json(applicants);
    } catch (error) {
        res.status(500).json({ error: 'Failed to read applicants.' });
    }
});

// POST a new Applicant
app.post('/api/applicants', async (req, res) => {
    try {
        const applicants = await readDB(APPLICANTS_FILE);
        const newApplicant = { id: crypto.randomUUID(), ...req.body };
        applicants.unshift(newApplicant);
        await writeDB(APPLICANTS_FILE, applicants);
        res.status(201).json(newApplicant);
    } catch (error) {
        res.status(500).json({ error: 'Failed to add applicant.' });
    }
});

// PUT (Update) an existing Applicant
app.put('/api/applicants/:id', async (req, res) => {
    try {
        const applicants = await readDB(APPLIC...
