import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();

import authRoutes from './routes/auth';
import patientRoutes from './routes/patients';
import doctorRoutes from './routes/doctors';
import catalogRoutes from './routes/catalog';
import orderRoutes from './routes/orders';
import specimenRoutes from './routes/specimens';
import resultRoutes from './routes/results';
import reportRoutes from './routes/reports';
import billingRoutes from './routes/billing';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/doctors', doctorRoutes);
app.use('/api/catalog', catalogRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/specimens', specimenRoutes);
app.use('/api/results', resultRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/billing', billingRoutes);

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`LMS backend listening on port ${port}`));
