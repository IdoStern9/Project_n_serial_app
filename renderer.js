const { SerialPort } = require('serialport');
const { decode } = require('@msgpack/msgpack');

let port = null;
let isOpen = false;

// Buffer to accumulate data
let accumulatedBuffer = Buffer.alloc(0); 

async function openOrClosePort() {
    const selectedPortPath = document.getElementById('usbPorts').value;
    const errorDisplay = document.getElementById('error'); // Reference to the error display element
    errorDisplay.textContent = ''; // Clear any previous error messages

    if (!isOpen) {
        if (selectedPortPath) {
            initializePort(selectedPortPath); // Encapsulate port initialization logic
        } else {
            errorDisplay.textContent = 'Please select a USB port'; // Prompt user to select a port
        }
    } else {
        // Close the port if it is currently open
        if (port && port.isOpen) {
            await port.close(); // This triggers the 'close' event which resets the state
        }
    }
}

function initializePort(selectedPortPath) {
    port = new SerialPort({ path: selectedPortPath, baudRate: 115200 });
    port.on('data', handleReceivedData);
    port.on('open', () => {
        console.log('Serial port opened');
        isOpen = true;
        document.getElementById('openPortButton').textContent = 'Close';
    });
    port.on('close', () => {
        console.log('Serial port closed');
        isOpen = false;
        document.getElementById('openPortButton').textContent = 'Open';
        accumulatedBuffer = Buffer.alloc(0); // Reset the buffer
        clearDiagnosticsDisplay(); // Clear diagnostics display
    });
}

function clearDiagnosticsDisplay() {
    const diagnosticsDiv = document.getElementById('diagnostics');
    diagnosticsDiv.innerHTML = ''; // Clears the diagnostics display area
}



async function listSerialPorts() 
{
    try 
    {
        const ports = await SerialPort.list();
        console.log('ports', ports);

        const usbPortsSelect = document.getElementById('usbPorts');
        usbPortsSelect.innerHTML = ''; // Clear existing options

        ports.forEach(port => 
            {
            if (port.vendorId && port.productId) // Check if it's a USB port
            { 
                const option = document.createElement('option');
                option.value = port.path;
                option.textContent = `${port.path} - ${port.manufacturer || 'Unknown Manufacturer'}`;
                usbPortsSelect.appendChild(option);
            }
        });

        if (usbPortsSelect.options.length === 0) 
        {
            document.getElementById('error').textContent = 'No USB ports discovered';
        } 
        else 
        {
            document.getElementById('error').textContent = '';
        }
    } 
    catch (err) 
    {
        console.error('Error listing serial ports:', err);
        document.getElementById('error').textContent = err.message;
    }
}

function handleReceivedData(data) {
    try {
        accumulatedBuffer = Buffer.concat([accumulatedBuffer, data]);

        while (accumulatedBuffer.length > 0) {
            const startIndicator = accumulatedBuffer.indexOf("---\n");
            if (startIndicator !== -1 && accumulatedBuffer.length > startIndicator + 8) {
                const sizeBytes = accumulatedBuffer.slice(startIndicator + 4, startIndicator + 8);
                const size = sizeBytes.readUInt32LE(0);

                if (accumulatedBuffer.length >= startIndicator + 8 + size) {
                    const messagePackData = accumulatedBuffer.slice(startIndicator + 8, startIndicator + 8 + size);
                    try {
                        const decodedData = decode(messagePackData);
                        updateDiagnosticsWindow(decodedData);
                    } catch (decodeError) {
                        console.error("Error decoding MessagePack data:", decodeError);
                        // Handle decode error, e.g., by breaking out of the loop
                        break;
                    }

                    // Adjust the buffer, assuming extra data handling is needed
                    accumulatedBuffer = accumulatedBuffer.slice(startIndicator + 8 + size);

                    // Check for extra bytes beyond expected size
                    if (accumulatedBuffer.length > 0 && accumulatedBuffer[0] !== expectedNextStartByte) {
                        console.log("Warning: Extra data found. Handling it...");
                        // Handle or log extra data scenario
                        // E.g., reset the buffer or process the extra data as a new message
                        accumulatedBuffer = Buffer.alloc(0); // Simplest approach: clear the buffer
                    }
                } else {
                    // Not enough data for a complete message, wait for more data
                    break;
                }
            } else {
                // No start indicator found or not enough data to include size info
                break;
            }
        }
    } catch (error) {
        console.error('Error handling received data:', error);
        const diagnosticsDiv = document.getElementById('diagnostics');
        diagnosticsDiv.appendChild(document.createTextNode(`Error: ${error.message}`));
    }
}

// Round all float values in the decoded data to 3 decimal places
function roundFloatValues(obj) 
{
    for (let key in obj) 
    {
        if (typeof obj[key] === 'number')
        {
            // Round float values to 3 decimal places
            obj[key] = Number(obj[key].toFixed(3));
        } else if (typeof obj[key] === 'object' && obj[key] !== null) 
        {
            // Recursively round floats in nested objects or arrays
            roundFloatValues(obj[key]);
        }
    }
}

function updateDiagnosticsWindow(decodedData) 
{
    const diagnosticsDiv = document.getElementById('diagnostics');
    diagnosticsDiv.innerHTML = ''; // Clear the diagnostics window for simplicity

    // Round all float values in the decoded data to 3 decimal places
    roundFloatValues(decodedData);

    const jsonData = JSON.stringify(decodedData, null, 2);
    const preTag = document.createElement('pre');
    preTag.textContent = jsonData;
    diagnosticsDiv.appendChild(preTag);
}

// file system module  
const fs = require('fs');
const log_to_file_enabled = true;

// Log to file
function logToFile(message) {
    // open logs folder if doesnt exists create it
    if (!fs.existsSync('logs')) 
    {
        fs.mkdirSync('logs');
    }

    // logfile name is the current date
    const logFile = `logs/${new Date().toISOString().slice(0, 10)}.log`;

    // write to log file
    fs.appendFileSync(logFile, message + '\n');
}


// Initialize USB port list
listSerialPorts();

// Add event listener to open/close button
document.getElementById('openPortButton').addEventListener('click', openOrClosePort);
