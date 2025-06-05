import { Router } from 'express';
import StakeholderCategoryService from '../services/StakeholderCategoryService.js';

const router = Router();

// List all stakeholder categories
router.get('/', async (req, res) => {
    try {
        console.log('StakeholderCategoryService.listStakeholderCategories()')
        const categories = await StakeholderCategoryService.listStakeholderCategories();
        res.json(categories);
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
    }
});

// Get stakeholder category by ID
router.get('/:id', async (req, res) => {
    try {
        console.log('StakeholderCategoryService.getStakeholderCategory() id:', req.params.id)
        const category = await StakeholderCategoryService.getStakeholderCategory(req.params.id);
        if (!category) {
            return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Category not found' } });
        }
        res.json(category);
    } catch (error) {
        console.error('Error fetching category:', error);
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
    }
});

// Create new stakeholder category
router.post('/', async (req, res) => {
    try {
        const category = await StakeholderCategoryService.createStakeholderCategory(req.body);
        res.status(201).json(category);
    } catch (error) {
        console.error('Error creating category:', error);
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
    }
});

// Update stakeholder category
router.put('/:id', async (req, res) => {
    try {
        const category = await StakeholderCategoryService.updateStakeholderCategory(req.params.id, req.body);
        if (!category) {
            return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Category not found' } });
        }
        res.json(category);
    } catch (error) {
        console.error('Error updating category:', error);
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
    }
});

// Delete stakeholder category
router.delete('/:id', async (req, res) => {
    try {
        const deleted = await StakeholderCategoryService.deleteStakeholderCategory(req.params.id);
        if (!deleted) {
            return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Category not found' } });
        }
        res.status(204).send();
    } catch (error) {
        console.error('Error deleting category:', error);
        if (error.message.includes('child categories')) {
            res.status(409).json({ error: { code: 'CONFLICT', message: error.message } });
        } else {
            res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
        }
    }
});

export default router;