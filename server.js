// This is the backend server that runs on your Debian machine.
// This version is modified to serve index.html from the project root.
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const cors = require('cors');
const multer = require('multer');
const archiver = require('archiver'); // For creating zip archives

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
app.use(express.json()); // Parse JSON bodies

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
        const applicants = await readDB(APPLICANTS_FILE);
        const index = applicants.findIndex(a => a.id === req.params.id);
        if (index === -1) {
            return res.status(404).json({ error: 'Applicant not found.' });
        }
        const updatedApplicant = { ...applicants[index], ...req.body };
        applicants[index] = updatedApplicant;
        await writeDB(APPLICANTS_FILE, applicants);
        res.json(updatedApplicant);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update applicant.' });
    }
});

// DELETE an Applicant
app.delete('/api/applicants/:id', async (req, res) => {
    try {
        // *** THIS IS THE CORRECTED LINE ***
        let applicants = await readDB(APPLICANTS_FILE);
        const initialLength = applicants.length;
        applicants = applicants.filter(a => a.id !== req.params.id);
        if (applicants.length === initialLength) {
             return res.status(404).json({ error: 'Applicant not found.' });
        }
        await writeDB(APPLICANTS_FILE, applicants);
        res.status(200).json({ message: 'Applicant deleted successfully.' });
    } catch (error) {
        console.error("Delete failed:", error); // Added for better server-side debugging
        res.status(500).json({ error: 'Failed to delete applicant.' });
    }
});

// POST (Upload) a file
app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }
    const fileUrl = `/uploads/${req.file.filename}`;
    res.status(200).json({ url: fileUrl });
});

// POST (Export) data
app.post('/api/export', async (req, res) => {
    const { type, ids } = req.body;
    
    try {
        const allApplicants = await readDB(APPLICANTS_FILE);
        const settings = await readDB(SETTINGS_FILE);
        
        const applicantsToExport = ids && ids.length > 0
            ? allApplicants.filter(a => ids.includes(a.id))
            : allApplicants;

        if (type === 'backup') {
            const backupData = {
                settings,
                applicants: applicantsToExport
            };
            res.setHeader('Content-Disposition', 'attachment; filename="visa-tracker-backup.json"');
            res.setHeader('Content-Type', 'application/json');
            res.send(JSON.stringify(backupData, null, 2));
        } else if (type === 'zip') {
            const filename = `visa-tracker-export-${Date.now()}.zip`;
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.setHeader('Content-Type', 'application/zip');
            
            const archive = archiver('zip', {
                zlib: { level: 9 } // Sets the compression level.
            });

            archive.on('error', (err) => {
                throw err;
            });

            // pipe archive data to the response
            archive.pipe(res);

            // 1. Create and add text file with applicant data
            let txtContent = 'Applicant Data Export\r\n=======================\r\n\r\n';
            applicantsToExport.forEach(app => {
                txtContent += `Name: ${app.FullName || 'N/A'}\r\n`;
                txtContent += `Passport: ${app.PassportNumber || 'N/A'}\r\n`;
                txtContent += `File Number: ${app.FileNumber || 'N/A'}\r\n`;
                txtContent += `UID: ${app.UIDNumber || 'N/A'}\r\n`;
                txtContent += `Email: ${app.Email || 'N/A'}\r\n`;
                txtContent += `Phone: ${app.Phone || 'N/A'}\r\n`;
                txtContent += `Nationality: ${app.Nationality || 'N/A'}\r\n`;
                txtContent += '-----------------------\r\n';
            });
            archive.append(txtContent, { name: 'applicant-data.txt' });

            // 2. Add all documents to the zip
            for (const applicant of applicantsToExport) {
                if (applicant.Documents) {
                    try {
                        const docs = JSON.parse(applicant.Documents);
                        for (const doc of docs) {
                            // doc.url is like '/uploads/filename.ext'
                            const filePath = path.join(__dirname, doc.url);
                            // check if file exists
                            try {
                                await fs.access(filePath);
                                // Sanitize applicant name for folder
                                const folderName = (applicant.FullName || 'unknown_applicant').replace(/[^a-z0-9]/gi, '_').toLowerCase();
                                const docName = (doc.name || 'unknown_doc').replace(/[^a-z0-9.]/gi, '_').toLowerCase();
                                archive.file(filePath, { name: `${folderName}/${docName}${path.extname(doc.url)}` });
                            } catch (e) {
                                console.warn(`File not found, skipping: ${filePath}`);
                            }
                        }
                    } catch (e) {
                        console.error(`Could not parse documents for applicant ${applicant.id}`, e);
                    }
                }
            }
            
            await archive.finalize();

        } else {
            res.status(400).json({ error: 'Invalid export type.' });
        }
    } catch (error) {
        console.error('Export error:', error);
        res.status(500).json({ error: 'Failed to export data.' });
    }
});


// POST (Import) a backup file
const importUpload = multer({ storage: multer.memoryStorage() }); // Store file in memory
app.post('/api/import', importUpload.single('backupFile'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No backup file uploaded.' });
    }

    try {
        const backupData = JSON.parse(req.file.buffer.toString('utf-8'));

        // Basic validation
        if (!backupData.settings || !Array.isArray(backupData.applicants)) {
            return res.status(400).json({ error: 'Invalid backup file format.' });
        }

        // Overwrite the database files
        await writeDB(SETTINGS_FILE, backupData.settings);
        await writeDB(APPLICANTS_FILE, backupData.applicants);

        res.json({ message: 'Import successful. Application data has been restored.' });
    } catch (error) {
        console.error('Import error:', error);
        res.status(500).json({ error: 'Failed to import data. The file may be corrupt or invalid.' });
    }
});


// --- ROOT ROUTE ---
// Serve the index.html for any request that is not an API call or a static file
app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).send('API endpoint not found.');
    }
    // Let static middleware handle file requests, otherwise send index.html
    next();
});

app.use(express.static(__dirname)); // Serve root files like index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});


// --- START SERVER ---
app.listen(port, async () => {
    // Ensure data and uploads directories exist
    try {
        await fs.mkdir(DB_PATH, { recursive: true });
        await fs.mkdir(UPLOADS_DIR, { recursive: true });
        // Ensure files exist
        await fs.access(APPLICANTS_FILE).catch(() => writeDB(APPLICANTS_FILE, []));
        await fs.access(SETTINGS_FILE).catch(() => writeDB(SETTINGS_FILE, { id: "settings_1", VISA_STEPS: ["Offer Letter", "Labour Fees", "Labour Insurance", "Entry Permit", "Change Status", "Medical Test", "Emirates ID", "Contract Submition", "Visa Stamping"] }));
        console.log(`Visa Tracker server listening on port ${port}`);
    } catch (error) {
        console.error("Failed to initialize server directories/files:", error);
    }
});
