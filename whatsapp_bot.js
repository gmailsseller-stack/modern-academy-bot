const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// مسار ملف قاعدة البيانات
const DB_FILE = path.join(__dirname, 'modren_id_pass.txt');

// تخزين جلسات البحث النشطة
const activeSearches = new Map();

// دالة لقراءة قاعدة البيانات المحلية إلى memory (للبحث السريع)
let localDB = new Map();
function loadLocalDatabase() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const content = fs.readFileSync(DB_FILE, 'utf8');
            const lines = content.split('\n');
            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed && trimmed.includes(':')) {
                    const [id, pass] = trimmed.split(':');
                    localDB.set(id.trim(), pass.trim());
                }
            }
            console.log(`[DB] Loaded ${localDB.size} entries from ${DB_FILE}`);
        } else {
            console.log(`[DB] File not found: ${DB_FILE}`);
        }
    } catch (err) {
        console.error(`[DB] Error loading database: ${err}`);
    }
}
loadLocalDatabase();

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

client.on('qr', (qr) => {
    console.clear();
    console.log('Scan QR Code with WhatsApp:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.clear();
    console.log('[OK] Bot is running!');
    console.log('[INFO] Send student ID to search');
});

// دالة البحث باستخدام get_pass.py مع arguments
function searchWithPython(studentId, isOnline = false) {
    return new Promise((resolve, reject) => {
        let command;
        if (isOnline) {
            // بحث أونلاين مع نطاق افتراضي
            command = `python get_pass.py --id ${studentId} --online`;
        } else {
            // بحث في الملف المحلي
            command = `python get_pass.py --id ${studentId} --database "${DB_FILE}"`;
        }
        
        console.log(`[CMD] ${command}`);
        
        const pythonProcess = exec(command, { encoding: 'utf8' }, (error, stdout, stderr) => {
            if (error) {
                reject(error);
                return;
            }
            
            // تحليل المخرجات
            const output = stdout + stderr;
            console.log(`[PY] ${output}`);
            
            // البحث عن PASSWORD_FOUND:xxxxxx
            const foundMatch = output.match(/PASSWORD_FOUND:(\d+)/);
            if (foundMatch) {
                const password = foundMatch[1];
                // إضافة إلى الذاكرة والملف
                if (!localDB.has(studentId)) {
                    localDB.set(studentId, password);
                    // إلحاق بالملف
                    fs.appendFileSync(DB_FILE, `${studentId}:${password}\n`, 'utf8');
                }
                resolve(password);
            } else if (output.includes('PASSWORD_NOT_FOUND')) {
                reject(new Error('Password not found'));
            } else {
                reject(new Error('Unknown error'));
            }
        });
        
        // إذا كان البحث أونلاين، قد يأخذ وقتاً؛ نتركه يعمل
    });
}

client.on('message', async (message) => {
    const studentId = message.body.trim();
    
    // تجاهل الأوامر
    if (studentId.toLowerCase() === 'ok' || 
        studentId.toLowerCase() === 'نعم' || 
        studentId.toLowerCase() === 'yes') {
        return;
    }
    
    // أولاً: البحث في الذاكرة المحلية (ملف id_pass.txt)
    if (localDB.has(studentId)) {
        const password = localDB.get(studentId);
        await message.reply(
            `✅ *Found in local DB*\n\n` +
            `🆔 ID: ${studentId}\n` +
            `🔑 Password: ${password}`
        );
        return;
    }
    
    // إذا لم يوجد، اعرض خيار البحث الأونلاين
    const askMessage = await message.reply(
        `❌ *ID ${studentId} not found in local database*\n\n` +
        `🔍 *Search online?*\n` +
        `✏️ Send *OK* to continue\n` +
        `⏱️ This may take about a minute`
    );
    
    activeSearches.set(message.from, {
        studentId: studentId,
        waitingForConfirmation: true,
        askMessage: askMessage
    });
    
    // إلغاء بعد 60 ثانية
    setTimeout(() => {
        if (activeSearches.has(message.from)) {
            activeSearches.delete(message.from);
            message.reply(`⏰ *Timeout*\nYou can send the ID again.`);
        }
    }, 600000);
});

// معالج خاص للردود
client.on('message', async (message) => {
    const reply = message.body.trim().toLowerCase();
    const userId = message.from;
    
    if (!activeSearches.has(userId)) return;
    
    const searchData = activeSearches.get(userId);
    if (!searchData.waitingForConfirmation) return;
    
    if (reply === 'ok' || reply === 'نعم' || reply === 'yes') {
        searchData.waitingForConfirmation = false;
        activeSearches.set(userId, searchData);
        
        const studentId = searchData.studentId;
        
        await message.reply(
            `🚀 *Starting online search*\n\n` +
            `🆔 ID: ${studentId}\n` +
            `⏱️ Estimated time: ~1 min\n` +
            `📡 Connecting...`
        );
        
        try {
            const password = await searchWithPython(studentId, true);
            
            await message.reply(
                `🎉 *Success!*\n\n` +
                `🆔 ID: ${studentId}\n` +
                `🔑 Password: ${password}\n\n` +
                `💾 Saved to local database`
            );
        } catch (error) {
            await message.reply(
                `❌ *Online search failed*\n` +
                `⚠️ ${error.message}\n\n` +
                `💡 Try again later`
            );
        } finally {
            activeSearches.delete(userId);
        }
    } else {
        await message.reply(`👋 *Search cancelled*`);
        activeSearches.delete(userId);
    }
});

client.initialize();