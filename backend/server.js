require('dotenv').config();
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('../public'));

// Initialize Supabase client
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

// Test Supabase connection
(async () => {
    const { data, error } = await supabase.from('equipment').select('count');
    if (error) {
        console.error('❌ Supabase connection failed:', error.message);
    } else {
        console.log('✅ Supabase connected successfully');
    }
})();


function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Expects: "Bearer <token>"

    if (!token) {
        return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // { userId, role, status, email }
        next();
    } catch (err) {
        return res.status(403).json({ error: 'Invalid or expired token.' });
    }
}

function requireAdmin(req, res, next) {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required.' });
    }
    next();
}

function requireActive(req, res, next) {
    if (req.user.status !== 'active') {
        return res.status(403).json({ error: 'Your account is inactive. Read-only access only.' });
    }
    next();
}

// ----------------- valiadtor ------------------

// Reusable validation error handler
function validate(validations) {
    return async (req, res, next) => {
        for (let validation of validations) {
            await validation.run(req);
        }
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                error: 'Validation failed', 
                details: errors.array().map(e => e.msg)
            });
        }
        next();
    };
}
// ==================== EQUIPMENT ROUTES ====================

// Get all equipment
app.get('/api/equipment', authenticateToken, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('equipment')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get single equipment
app.get('/api/equipment/:id', authenticateToken, requireActive, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('equipment')
            .select('*')
            .eq('id', req.params.id)
            .single();
        
        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(404).json({ error: 'Equipment not found' });
    }
});

// Add new equipment
app.post('/api/equipment', authenticateToken, requireActive, 
    validate([
        body('name').notEmpty().trim().withMessage('Equipment name is required'),
        body('quantity').isInt({ min: 0 }).withMessage('Quantity must be a positive number'),
        body('category').optional().trim().isLength({ max: 50 }).withMessage('Category too long'),
        body('model').optional().trim().isLength({ max: 100 }).withMessage('Model too long'),
        body('serial_number').optional().trim().isLength({ max: 100 }).withMessage('Serial number too long'),
    ]),
    async (req, res) => {
    try {
        const { name, model, serial_number, quantity, category } = req.body;
        const { data, error } = await supabase
            .from('equipment')
            .insert([{ name, model, serial_number, quantity, category }])
            .select();
        
        if (error) throw error;
        res.status(201).json({ id: data[0].id, message: 'Equipment added successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update equipment
app.put('/api/equipment/:id', authenticateToken, requireAdmin, 
    requireActive,
    validate([
        body('name').notEmpty().trim().withMessage('Equipment name is required'),
        body('quantity').isInt({ min: 0 }).withMessage('Quantity must be a positive number'),
    ]),
    async (req, res) => {
    try {
        const { name, model, serial_number, quantity, category } = req.body;
        const { error } = await supabase
            .from('equipment')
            .update({ name, model, serial_number, quantity, category })
            .eq('id', req.params.id);
        
        if (error) throw error;
        res.json({ message: 'Equipment updated successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete equipment
app.delete('/api/equipment/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { error } = await supabase
            .from('equipment')
            .delete()
            .eq('id', req.params.id);
        
        if (error) throw error;
        res.json({ message: 'Equipment deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== MACHINES ROUTES ====================

// Get all machines
app.get('/api/machines', authenticateToken, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('machines')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Add new machine
app.post('/api/machines', authenticateToken, 
    requireActive,
    validate([
        body('machine_name').notEmpty().trim().withMessage('Machine name is required'),
        body('location').notEmpty().trim().withMessage('Location is required'),
        body('status').optional().isIn(['working', 'needs_repair', 'under_repair', 'repaired'])
            .withMessage('Invalid status value'),
    ]),
    async (req, res) => {
    try {
        const { machine_name, model, location, status } = req.body;
        const { data, error } = await supabase
            .from('machines')
            .insert([{ machine_name, model, location, status: status || 'working' }])
            .select();
        
        if (error) throw error;
        res.status(201).json({ id: data[0].id, message: 'Machine added successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update machine
app.put('/api/machines/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { machine_name, model, location, status } = req.body;
        const { error } = await supabase
            .from('machines')
            .update({ machine_name, model, location, status })
            .eq('id', req.params.id);
        
        if (error) throw error;
        res.json({ message: 'Machine updated successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete machine
app.delete('/api/machines/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { error } = await supabase
            .from('machines')
            .delete()
            .eq('id', req.params.id);
        
        if (error) throw error;
        res.json({ message: 'Machine deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== REPAIR ORDERS ROUTES ====================

// Get all repair orders with machine details
app.get('/api/repairs', authenticateToken, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('repair_orders')
            .select(`
                *,
                machines (
                    machine_name,
                    model,
                    location
                )
            `)
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        // Flatten the response
        const formatted = data.map(r => ({
            ...r,
            machine_name: r.machines.machine_name,
            model: r.machines.model,
            location: r.machines.location
        }));
        
        res.json(formatted);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get single repair order with equipment details
app.get('/api/repairs/:id', authenticateToken, requireActive, async (req, res) => {
    try {
        const { data: repair, error: repairError } = await supabase
            .from('repair_orders')
            .select(`
                *,
                machines (
                    machine_name,
                    model,
                    location
                )
            `)
            .eq('id', req.params.id)
            .single();
        
        if (repairError) throw repairError;

        const { data: equipmentOrders, error: eqError } = await supabase
            .from('equipment_orders')
            .select(`
                *,
                equipment (
                    name,
                    model,
                    category
                )
            `)
            .eq('repair_order_id', req.params.id);
        
        if (eqError) throw eqError;

        res.json({ 
            ...repair, 
            machine_name: repair.machines.machine_name,
            equipment_orders: equipmentOrders 
        });
    } catch (err) {
        res.status(404).json({ error: 'Repair order not found' });
    }
});

// Create new repair order
app.post('/api/repairs', authenticateToken, requireActive, 
    validate([
        body('machine_id').isInt({ min: 1 }).withMessage('Valid machine is required'),
        body('issue_description').notEmpty().trim().isLength({ min: 10 })
            .withMessage('Issue description must be at least 10 characters'),
    ]),
    async (req, res) => {
    try {
        const { machine_id, issue_description, equipment_orders } = req.body;
        
        // Insert repair order
        const { data: repair, error: repairError } = await supabase
            .from('repair_orders')
            .insert([{ 
                machine_id, 
                issue_description, 
                status: 'pending' 
            }])
            .select();
        
        if (repairError) throw repairError;
        
        const repairOrderId = repair[0].id;

        // Update machine status
        await supabase
            .from('machines')
            .update({ status: 'needs_repair' })
            .eq('id', machine_id);

        // Insert equipment orders if provided
        if (equipment_orders && equipment_orders.length > 0) {
            const equipmentData = equipment_orders.map(eq => ({
                repair_order_id: repairOrderId,
                equipment_id: eq.equipment_id,
                quantity_needed: eq.quantity_needed,
                status: 'ordered'
            }));

            await supabase
                .from('equipment_orders')
                .insert(equipmentData);
        }

        res.status(201).json({ id: repairOrderId, message: 'Repair order created successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update repair order status
app.put('/api/repairs/:id', authenticateToken, requireActive, 
     validate([
        body('status').isIn(['pending', 'in_progress', 'completed'])
            .withMessage('Status must be pending, in_progress, or completed'),
    ]),
    async (req, res) => {
    try {
        const { status } = req.body;
        const completedAt = status === 'completed' ? new Date().toISOString() : null;

        const { error } = await supabase
            .from('repair_orders')
            .update({ status, completed_at: completedAt })
            .eq('id', req.params.id);

        if (error) throw error;

        // If completed, update machine status
        if (status === 'completed') {
            const { data: repair } = await supabase
                .from('repair_orders')
                .select('machine_id')
                .eq('id', req.params.id)
                .single();
            
            if (repair) {
                await supabase
                    .from('machines')
                    .update({ status: 'working' })
                    .eq('id', repair.machine_id);
            }
        }

        res.json({ message: 'Repair order updated successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== DASHBOARD STATS ====================

app.get('/api/stats', authenticateToken, requireActive,  async (req, res) => {
    try {
        const { count: equipmentCount } = await supabase
            .from('equipment')
            .select('*', { count: 'exact', head: true });

        const { count: machineCount } = await supabase
            .from('machines')
            .select('*', { count: 'exact', head: true });

        const { count: pendingRepairs } = await supabase
            .from('repair_orders')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending');

        const { count: activeRepairs } = await supabase
            .from('repair_orders')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'in_progress');

        res.json({
            total_equipment: equipmentCount || 0,
            total_machines: machineCount || 0,
            pending_repairs: pendingRepairs || 0,
            active_repairs: activeRepairs || 0
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});



// Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .single();

        if (error || !user) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        // Generate JWT token (expires in 8 hours)
        const token = jwt.sign(
            {
                userId: user.id,
                email: user.email,
                role: user.role,
                status: user.status
            },
            process.env.JWT_SECRET,
            { expiresIn: '8h' }
        );

        // Remove password from response
        delete user.password;

        res.json({
            message: 'Login successful',
            token: token, // Send token to frontend
            user: user
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// Create new employee (Admin only)
app.post('/api/auth/signup',
     validate([
        body('name').notEmpty().trim().withMessage('Name is required'),
        body('email').isEmail().withMessage('Valid email is required'),
        body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    ]), async (req, res) => {
    try {
        const { name, email, password, role, created_by } = req.body;

        // Input validation
        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Name, email and password are required' });
        }

        if (password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters' });
        }

        // Verify the creator is an admin
        const { data: creator, error: creatorError } = await supabase
            .from('users')
            .select('role')
            .eq('id', created_by)
            .single();

        if (creatorError || creator.role !== 'admin') {
            return res.status(403).json({ error: 'Only admins can create employees' });
        }

        // Check if email already exists
        const { data: existing } = await supabase
            .from('users')
            .select('email')
            .eq('email', email)
            .single();

        if (existing) {
            return res.status(400).json({ error: 'Email already exists' });
        }

        // Hash the password before storing
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create new user with hashed password
        const { data, error } = await supabase
            .from('users')
            .insert([{
                name,
                email,
                password: hashedPassword, // ✅ Hashed, never plain text
                role: role || 'employee',
                status: 'active',
                created_by
            }])
            .select();

        if (error) throw error;

        res.status(201).json({
            message: 'Employee created successfully',
            user: { id: data[0].id, name: data[0].name, email: data[0].email }
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// ==================== USER MANAGEMENT ROUTES (Admin Only) ====================

// Get all users (employees)
app.get('/api/users', authenticateToken, requireAdmin,  async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('id, name, email, role, status, created_at')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update user status (activate/deactivate)
app.put('/api/users/:id/status', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { status } = req.body;
        const { error } = await supabase
            .from('users')
            .update({ status })
            .eq('id', req.params.id);
        
        if (error) throw error;
        res.json({ message: 'User status updated successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update user details
app.put('/api/users/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { name, email, role } = req.body;
        const { error } = await supabase
            .from('users')
            .update({ name, email, role })
            .eq('id', req.params.id);
        
        if (error) throw error;
        res.json({ message: 'User updated successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete user
app.delete('/api/users/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { error } = await supabase
            .from('users')
            .delete()
            .eq('id', req.params.id);
        
        if (error) throw error;
        res.json({ message: 'User deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== CUSTOMER ROUTES ====================

// Get all customers
app.get('/api/customers', authenticateToken,
     requireActive,
    validate([
        body('customer_name').notEmpty().trim().withMessage('Customer name is required'),
        body('customer_code').notEmpty().trim().withMessage('Customer code is required'),
        body('email').optional().isEmail().withMessage('Invalid email format'),
        body('phone').optional().trim().isLength({ max: 20 }).withMessage('Phone number too long'),
    ]),
    async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('customers')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get single customer
app.get('/api/customers/:id', authenticateToken, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('customers')
            .select('*')
            .eq('id', req.params.id)
            .single();
        
        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(404).json({ error: 'Customer not found' });
    }
});

// Add new customer
app.post('/api/customers', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { customer_name, company_name, contact_person, email, phone, address, customer_code, notes, created_by } = req.body;
        
        const { data, error } = await supabase
            .from('customers')
            .insert([{ 
                customer_name, 
                company_name, 
                contact_person, 
                email, 
                phone, 
                address, 
                customer_code, 
                notes,
                created_by 
            }])
            .select();
        
        if (error) throw error;
        res.status(201).json({ id: data[0].id, message: 'Customer added successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update customer
app.put('/api/customers/:id', authenticateToken, requireActive,
    validate([
        body('customer_name').notEmpty().trim().withMessage('Customer name is required'),
        body('email').optional().isEmail().withMessage('Invalid email format'),
    ]), async (req, res) => {
    try {
        const { customer_name, company_name, contact_person, email, phone, address, customer_code, notes } = req.body;
        
        const { error } = await supabase
            .from('customers')
            .update({ customer_name, company_name, contact_person, email, phone, address, customer_code, notes })
            .eq('id', req.params.id);
        
        if (error) throw error;
        res.json({ message: 'Customer updated successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete customer
app.delete('/api/customers/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { error } = await supabase
            .from('customers')
            .delete()
            .eq('id', req.params.id);
        
        if (error) throw error;
        res.json({ message: 'Customer deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get customer's machines
app.get('/api/customers/:id/machines', authenticateToken, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('machines')
            .select('*')
            .eq('customer_id', req.params.id);
        
        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// ==================== REPORTS ROUTES ====================

// Equipment stock levels (for low-stock report)
app.get('/api/reports/equipment-stock', authenticateToken, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('equipment')
            .select('name, quantity, category')
            .order('quantity', { ascending: true });

        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Repair status breakdown (pending / in_progress / completed counts)
app.get('/api/reports/repair-status', authenticateToken, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('repair_orders')
            .select('status');

        if (error) throw error;

        const counts = { pending: 0, in_progress: 0, completed: 0 };
        data.forEach(r => {
            if (counts[r.status] !== undefined) counts[r.status]++;
        });

        res.json([
            { name: 'Pending', value: counts.pending },
            { name: 'In Progress', value: counts.in_progress },
            { name: 'Completed', value: counts.completed }
        ]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Repairs over time (grouped by month)
app.get('/api/reports/repairs-over-time', authenticateToken, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('repair_orders')
            .select('created_at')
            .order('created_at', { ascending: true });

        if (error) throw error;

        const grouped = {};
        data.forEach(r => {
            const date = new Date(r.created_at);
            const key = date.toLocaleString('default', { month: 'short', year: 'numeric' });
            grouped[key] = (grouped[key] || 0) + 1;
        });

        const result = Object.keys(grouped).map(key => ({
            month: key,
            repairs: grouped[key]
        }));

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Repairs per customer (via machines -> customer link)
app.get('/api/reports/repairs-per-customer', authenticateToken, async (req, res) => {
    try {
        const { data: repairs, error: repairError } = await supabase
            .from('repair_orders')
            .select(`
                id,
                machines (
                    customer_id,
                    customers ( customer_name )
                )
            `);

        if (repairError) throw repairError;

        const counts = {};
        repairs.forEach(r => {
            const customerName = r.machines?.customers?.customer_name || 'Unassigned';
            counts[customerName] = (counts[customerName] || 0) + 1;
        });

        const result = Object.keys(counts).map(name => ({
            name,
            repairs: counts[name]
        }));

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});