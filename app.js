// Global placeholder for the active asset details evaluated by the AI
let currentEvaluatedItem = null;

// Replace this with your generated Reverb Access Token for development testing
const REVERB_ACCESS_TOKEN = "YOUR_SAVED_PERSONAL_ACCESS_TOKEN"; 

// UI Event Listeners
document.getElementById('photo-btn').addEventListener('click', () => {
    // Simulate an item appraisal run
    simulateAIScan();
});

document.getElementById('images-btn').addEventListener('click', () => {
    simulateAIScan();
});

/**
 * Simulates MachZero's image analysis process.
 * Alternates results between music gear and standard home items to test interface changes.
 */
function simulateAIScan() {
    const detailsBox = document.getElementById('appraisal-details');
    detailsBox.innerHTML = `<p style="color: #00adb5; text-align: center; font-weight: bold;">Analyzing items and processing measurements...</p>`;

    // 50/50 mix generator to demonstrate how the UI filters out irrelevant entries
    const simulateInstrument = Math.random() > 0.5;

    setTimeout(() => {
        if (simulateInstrument) {
            currentEvaluatedItem = {
                title: "Fender Stratocaster Electric Guitar",
                make: "Fender",
                model: "Stratocaster",
                category: "Guitars",
                productType: "electric-guitars",
                dimensions: "39\" x 12.5\" x 2.5\"",
                estimatedValue: "$950.00",
                condition: "Excellent"
            };
        } else {
            currentEvaluatedItem = {
                title: "Mid-Century Modern Wooden Coffee Table",
                category: "Furniture",
                dimensions: "42\" x 24\" x 18\"",
                estimatedValue: "$180.00",
                condition: "Good"
            };
        }

        renderAppraisalResults(currentEvaluatedItem);
    }, 1500);
}

/**
 * Renders data fields onto the main panel and executes conditional routing check.
 */
function renderAppraisalResults(item) {
    const detailsBox = document.getElementById('appraisal-details');
    
    detailsBox.innerHTML = `
        <div class="result-item">
            <span class="label">Identified Item</span>
            <span class="value">${item.title}</span>
        </div>
        <div class="result-item">
            <span class="label">Estimated Resale Value</span>
            <span class="value" style="color: #10b981; font-weight: bold;">${item.estimatedValue}</span>
        </div>
        <div class="result-item">
            <span class="label">Calculated Dimensions</span>
            <span class="value">${item.dimensions}</span>
        </div>
        <div class="result-item">
            <span class="label">Condition Metric</span>
            <span class="value">${item.condition}</span>
        </div>
    `;

    // Strict validation loop: Only reveal Reverb options if the asset falls into musical inventory
    const reverbCard = document.getElementById('reverb-container');
    if (item.category === "Guitars") {
        reverbCard.style.display = 'block'; // Reveal options cleanly
    } else {
        reverbCard.style.display = 'none';  // Keep completely hidden for any other item type
    }
}

/**
 * Handles the communication workflow directly with Reverb's REST framework.
 */
document.getElementById('post-reverb-btn').addEventListener('click', async () => {
    if (!currentEvaluatedItem || !currentEvaluatedItem.make) {
        alert("No valid musical instrument data staged.");
        return;
    }

    const postButton = document.getElementById('post-reverb-btn');
    postButton.disabled = true;
    postButton.innerText = "PUBLISHING DRAFT TO YOUR ACCOUNT...";

    // Map MachZero's generated metadata into Reverb's exact API schema requirements
    const payload = {
        make: currentEvaluatedItem.make,
        model: currentEvaluatedItem.model,
        product_type: currentEvaluatedItem.productType,
        condition: currentEvaluatedItem.condition,
        title: `${currentEvaluatedItem.title} - Verified Draft`,
        description: `MachZero Appraisal Diagnostics:\n• Target Dimensions: ${currentEvaluatedItem.dimensions}\n• System Analysis Status: Verified.`,
        price: {
            amount: currentEvaluatedItem.estimatedValue.replace('$', ''),
            currency: "USD"
        },
        publish: false // Strictly stage as an un-published draft for security validation
    };

    try {
        // Send the HTTP POST request to Reverb's listings endpoint
        const response = await fetch('https://api.reverb.com/api/listings', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${REF_ACCESS_TOKEN_FALLBACK(REVERB_ACCESS_TOKEN)}`,
                'Content-Type': 'application/hal+json',
                'Accept': 'application/hal+json',
                'Accept-Version': '3.0' // Explicitly use modern API processing targets
            },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            const data = await response.json();
            alert("Draft staging complete! Go to your Reverb account listings to view it.");
            document.getElementById('reverb-container').style.display = 'none';
        } else {
            const errData = await response.json().catch(() => ({}));
            console.error("Reverb rejection response payload:", errData);
            alert(`Listing rejection: ${response.status} Check your browser console log.`);
        }
    } catch (err) {
        console.error("Network interface error:", err);
        alert("Connection blocked. Ensure valid API parameters or proxy routing setups.");
    } finally {
        postButton.disabled = false;
        postButton.innerText = "SEND DRAFT TO REVERB.COM";
    }
});

function REF_ACCESS_TOKEN_FALLBACK(token) {
    return token; 
}
