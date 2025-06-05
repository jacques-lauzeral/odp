import { Command } from 'commander';
import Table from 'cli-table3';
import fetch from 'node-fetch';

export function stakeholderCategoryCommands(program, config) {
    const baseUrl = config.server.baseUrl;

    // Create stakeholder-category subcommand
    const stakeholderCategory = new Command('stakeholder-category')
        .description('Manage stakeholder categories');

    // List command
    stakeholderCategory
        .command('list')
        .description('List all stakeholder categories')
        .action(async () => {
            try {
                const response = await fetch(`${baseUrl}/stakeholder-categories`);

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                const categories = await response.json();

                if (categories.length === 0) {
                    console.log('No stakeholder categories found.');
                    return;
                }

                const table = new Table({
                    head: ['ID', 'Name', 'Description'],
                    colWidths: [10, 30, 50]
                });

                categories.forEach(category => {
                    table.push([
                        category.id,
                        category.name,
                        category.description
                    ]);
                });

                console.log(table.toString());
            } catch (error) {
                console.error('Error listing categories:', error.message);
                process.exit(1);
            }
        });

    // Show command
    stakeholderCategory
        .command('show <id>')
        .description('Show a specific stakeholder category')
        .action(async (id) => {
            try {
                const response = await fetch(`${baseUrl}/stakeholder-categories/${id}`);

                if (response.status === 404) {
                    console.error(`Category with ID ${id} not found.`);
                    process.exit(1);
                }

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                const category = await response.json();

                console.log(`ID: ${category.id}`);
                console.log(`Name: ${category.name}`);
                console.log(`Description: ${category.description}`);
            } catch (error) {
                console.error('Error getting category:', error.message);
                process.exit(1);
            }
        });

    // Create command
    stakeholderCategory
        .command('create <name> <description>')
        .description('Create a new stakeholder category')
        .option('--parent <id>', 'Parent category ID')
        .action(async (name, description, options) => {
            try {
                const data = {
                    name,
                    description,
                    parentId: options.parent || null
                };

                const response = await fetch(`${baseUrl}/stakeholder-categories`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(data)
                });

                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(`HTTP ${response.status}: ${error.error?.message || response.statusText}`);
                }

                const category = await response.json();
                console.log(`Created category: ${category.name} (ID: ${category.id})`);
            } catch (error) {
                console.error('Error creating category:', error.message);
                process.exit(1);
            }
        });

    // Update command
    stakeholderCategory
        .command('update <id> <name> <description>')
        .description('Update a stakeholder category')
        .option('--parent <id>', 'Parent category ID')
        .action(async (id, name, description, options) => {
            try {
                const data = {
                    id,
                    name,
                    description,
                    parentId: options.parent || null
                };

                const response = await fetch(`${baseUrl}/stakeholder-categories/${id}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(data)
                });

                if (response.status === 404) {
                    console.error(`Category with ID ${id} not found.`);
                    process.exit(1);
                }

                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(`HTTP ${response.status}: ${error.error?.message || response.statusText}`);
                }

                const category = await response.json();
                console.log(`Updated category: ${category.name} (ID: ${category.id})`);
            } catch (error) {
                console.error('Error updating category:', error.message);
                process.exit(1);
            }
        });

    // Delete command
    stakeholderCategory
        .command('delete <id>')
        .description('Delete a stakeholder category')
        .action(async (id) => {
            try {
                const response = await fetch(`${baseUrl}/stakeholder-categories/${id}`, {
                    method: 'DELETE'
                });

                if (response.status === 404) {
                    console.error(`Category with ID ${id} not found.`);
                    process.exit(1);
                }

                if (response.status === 409) {
                    console.error(`Cannot delete category with ID ${id}: has dependencies.`);
                    process.exit(1);
                }

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                console.log(`Deleted category with ID: ${id}`);
            } catch (error) {
                console.error('Error deleting category:', error.message);
                process.exit(1);
            }
        });

    // Add to main program
    program.addCommand(stakeholderCategory);
}