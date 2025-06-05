import express from 'express';
import { initializeStores, closeStores } from './store/index.js';
import stakeholderCategoryRoutes from './routes/stakeholder-category.js';

const app = express();
const PORT = process.env.PORT || 80;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/hello', (req, res) => {
    res.json({ status: 'ok', message: 'ODP Server running', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/stakeholder-categories', stakeholderCategoryRoutes);

// Error handling
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
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