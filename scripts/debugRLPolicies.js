/**
 * Debug script to list all RL policies in MongoDB
 * Usage: node scripts/debugRLPolicies.js
 */

const mongoose = require('mongoose');
const { connectDB, disconnectDB } = require('../server/lib/database');
const { RLPolicy } = require('../server/models');

async function debugPolicies() {
    console.log('🔍 Connecting to MongoDB...');
    await connectDB();

    try {
        console.log('📋 Fetching all RL Policies...');
        const policies = await RLPolicy.find({}).sort({ updatedAt: -1 });

        if (policies.length === 0) {
            console.log('❌ No policies found in database!');
        } else {
            console.log(`✅ Found ${policies.length} policies:`);
            policies.forEach(p => {
                console.log(`   - Name: "${p.name}" | ID: ${p._id} | Active: ${p.isActive} | Type: ${p.type} | Updated: ${p.updatedAt}`);
            });
        }

        // Check specific query used by getRLPolicyMongoOnly
        console.log('\n🔍 Testing "space_rl_model" query...');
        const active = await RLPolicy.findOne({ name: 'space_rl_model', isActive: true });
        if (active) {
            console.log('✅ Active "space_rl_model" FOUND!');
        } else {
            console.log('❌ Active "space_rl_model" NOT found.');
        }

    } catch (err) {
        console.error('❌ Error querying policies:', err);
    } finally {
        await disconnectDB();
    }
}

debugPolicies();
