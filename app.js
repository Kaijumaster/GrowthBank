// --- CONFIGURATION ---
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxjpSyxYOI7FkD-ln5zuxTpzXVxjlwsC71NjKGCNhAa6nj4YV2tVzJVO03cqwaTlyE/exec';
let systemRules = {};
let loggedDates = []; // Stores dates already in the sheet to prevent duplicates

// --- 1. FETCH EVERYTHING ---
async function loadEverything() {
    try {
        const res = await fetch(SCRIPT_URL);
        const json = await res.json();
        
        // Load Rules
        json.rules.forEach(row => {
            if (!row[0] || row[0] === 'Rule Name' || row[0].toString().startsWith('SECTION')) return;
            systemRules[row[0]] = { 
                value: parseFloat(row[1]) || 0, 
                group: (row[3] && row[3] !== 'None') ? row[3] : null, 
                res: row[4] 
            };
        });

        // Load existing dates for Duplicate Check (Assuming Column A is Date)
        if (json.logs) {
            loggedDates = json.logs.map(row => row[0].toString().split('T')[0]);
        }

        // Load Stats (Row 2, Column E is index 4)
        if (json.stats && json.stats.length > 1) {
            updateLifetimeDisplay(json.stats[1][4] || 0);
        }
    } catch (e) { console.error("Sync Error:", e); }
}

// --- 2. THE LOGIC ENGINE ---
function calculateTotal() {
    const data = {
        study: parseInt(document.getElementById('study-mins').value) || 0,
        writing: parseInt(document.getElementById('writing-mins').value) || 0,
        qNotes: parseInt(document.getElementById('quality-notes').value) || 0,
        rNotes: parseInt(document.getElementById('revision-notes').value) || 0,
        room: document.getElementById('chore-room').checked,
        dishes: document.getElementById('chore-dishes').checked
    };

    let items = [
        { name: 'Base_Study', val: data.study * (systemRules['Base_Study']?.value || 0) },
        { name: 'Base_Writing', val: data.writing * (systemRules['Base_Writing']?.value || 0) },
        { name: 'Quality_Notes', val: data.qNotes * (systemRules['Quality_Notes']?.value || 0) },
        { name: 'Revision_Notes', val: data.rNotes * (systemRules['Revision_Notes']?.value || 0) },
        { name: 'Chore_CleanRoom', val: data.room ? (systemRules['Chore_CleanRoom']?.value || 0) : 0 },
        { name: 'Chore_Dishes', val: data.dishes ? (systemRules['Chore_Dishes']?.value || 0) : 0 }
    ].filter(i => i.val > 0);

    // Conflict Resolution Logic
    let finalItems = [];
    let groups = {};
    items.forEach(i => {
        let rule = systemRules[i.name];
        if (rule?.group) {
            if (!groups[rule.group]) groups[rule.group] = [];
            groups[rule.group].push({ ...i, res: rule.res });
        } else {
            finalItems.push(i);
        }
    });

    for (let g in groups) {
        let members = groups[g];
        if (members[0].res === 'Max') finalItems.push(members.reduce((a, b) => a.val > b.val ? a : b));
    }

    const list = document.getElementById('breakdown-list');
    list.innerHTML = '';
    let total = 0;
    finalItems.forEach(i => {
        total += i.val;
        list.innerHTML += `<li>${i.name} <strong>+${i.val}</strong></li>`;
    });
    document.getElementById('today-points').innerText = total;
}

// --- 3. WRITE DATA (SEND TO SHEETS) ---
async function sendLog(type) {
    const date = document.getElementById('log-date').value;
    const items = document.querySelectorAll('#breakdown-list li');
    
    for (let item of items) {
        // We find the text, split it at ' +', and clean it
        let name = item.childNodes[0].textContent.trim(); 
        let points = parseInt(item.querySelector('strong').innerText.replace('+', ''));
        
        const payload = {
            date: date,
            activity: name,
            points: points, // Sending as a clean number
            type: type
        };
        
        await fetch(SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    }
    alert("Breakdown logged correctly!");
}

// --- 4. UI HELPERS ---
function updateLifetimeDisplay(pts) {
    document.getElementById('lifetime-points').innerText = pts;
    document.getElementById('lifetime-value').innerText = `$${(pts * (systemRules['Point_Value_USD']?.value || 0.1)).toFixed(2)}`;
}

// Duplicate Date Check UI
document.getElementById('log-date').addEventListener('change', (e) => {
    const saveBtn = document.getElementById('save-btn');
    if (loggedDates.includes(e.target.value)) {
        alert("Warning: This date is already logged!");
        saveBtn.disabled = true;
    } else {
        saveBtn.disabled = false;
    }
});

window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('calculate-btn').addEventListener('click', calculateTotal);
    loadEverything();
});