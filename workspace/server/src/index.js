import express from 'express';
import { initializeStores, closeStores, stakeholderCategoryStore, createTransaction, commitTransaction, rollbackTransaction } from './store/index.js';

const app = express();
const PORT = process.env.PORT || 80;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/hello', (req, res) => {
    res.json({ status: 'ok', message: 'ODP Server running', timestamp: new Date().toISOString() });
});

// StakeholderCategory endpoints
app.get('/stakeholder-categories', async (req, res) => {
    const tx = createTransaction();
    try {
        const store = stakeholderCategoryStore();
        const categories = await store.findAll(tx);
        await commitTransaction(tx);
        res.json(categories);
    } catch (error) {
        await rollbackTransaction(tx);
        console.error('Error fetching categories:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/stakeholder-categories', async (req, res) => {
    const tx = createTransaction();
    try {
        const store = stakeholderCategoryStore();
        const category = await store.create(req.body, tx);

        // Handle parentId if provided
        if (req.body.parentId) {
            await store.createRefinesRelation(category.id, req.body.parentId, tx);
        }

        await commitTransaction(tx);
        res.status(201).json(category);
    } catch (error) {
        await rollbackTransaction(tx);
        console.error('Error creating category:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Error handling
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully');
    await closeStores();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down gracefully');
    await closeStores();
    process.exit(0);
});

// Start server
async function startServer() {
    try {
        console.log('Initializing store layer...');
        await initializeStores();
        console.log('Store layer initialized successfully');

        app.listen(PORT, '0.0.0.0', () => {
            console.log(`ODP Server running on port ${PORT}`);
            console.log(`Health check: http://localhost:${PORT}/hello`);
            console.log(`API: http://localhost:${PORT}/stakeholder-categories`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();