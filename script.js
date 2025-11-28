/**
 * Lógica principal para la calculadora de Subnetting IP (CLSM y VLSM).
 */

function calculateSubnetting() {
    const ipAddressStr = document.getElementById('ip-address').value;
    const initialCidr = parseInt(document.getElementById('initial-cidr').value);
    const calculationMode = document.querySelector('input[name="calc-mode"]:checked').value;
    const resultsContainer = document.getElementById('results-container');
    let output = '';

    // 1. Validaciones
    if (!isValidIP(ipAddressStr) || isNaN(initialCidr) || initialCidr < 1 || initialCidr > 30) {
        output = '<p style="color: red;">Error: Por favor, ingrese una IP de red y un prefijo inicial válidos (entre /1 y /30).</p>';
        resultsContainer.innerHTML = output;
        return;
    }

    const ipOctets = ipAddressStr.split('.').map(Number);

    if (calculationMode === 'vlsm') {
        // 2. Ejecutar Lógica VLSM (Máscara de Subred de Longitud Variable)
        const hostInputs = document.querySelectorAll('.vlsm-host-input');
        const hostRequirements = Array.from(hostInputs)
            .map(input => parseInt(input.value))
            .filter(h => h > 0);

        if (hostRequirements.length === 0) {
            output = '<p style="color: red;">Error: Debe ingresar al menos un requisito de Hosts para VLSM.</p>';
            resultsContainer.innerHTML = output;
            return;
        }

        hostRequirements.sort((a, b) => b - a);
        output = calculateVLSM(ipOctets, initialCidr, hostRequirements);

    } else {
        // 2. Ejecutar Lógica CLSM (Máscara de Subred Sin Clases - Tamaño Fijo)
        const calculationType = document.querySelector('input[name="calc-type"]:checked').value;
        const desiredValue = parseInt(document.getElementById('desired-value').value);
        
        if (isNaN(desiredValue) || desiredValue < 1) {
            output = '<p style="color: red;">Error: El valor deseado no puede ser menor a 1.</p>';
            resultsContainer.innerHTML = output;
            return;
        }
        
        output = calculateCLSM(ipOctets, initialCidr, calculationType, desiredValue);
    }

    // 3. Insertar el contenido
    resultsContainer.innerHTML = output;
}

// ----------------------------------------------------------------------
// LÓGICA CLSM (TAMAÑO FIJO)
// ----------------------------------------------------------------------

/**
 * Lógica para cálculo CLSM (Subnetting de Tamaño Fijo).
 */
function calculateCLSM(ipOctets, initialCidr, calculationType, desiredValue) {
    const newCidrResult = calculateNewCIDR(initialCidr, calculationType, desiredValue);
    
    if (newCidrResult.error) {
        return `<p style="color: red;">Error: ${newCidrResult.error}</p>`;
    }

    const desiredCidr = newCidrResult.cidr;
    const borrowedBits = desiredCidr - initialCidr;
    const hostBits = 32 - desiredCidr;
    const totalAddresses = Math.pow(2, hostBits);
    const subnetCount = Math.pow(2, borrowedBits);
    
    const maskDetails = getMaskCalculationDetails(desiredCidr);
    
    let output = `<h2>Paso a Paso del Cálculo (CLSM)</h2>`;
    output += `<small>Classless Subnet Mask (Máscara de Subred sin Clases)</small>`;
    output += `<p><strong>IP de Red Inicial:</strong> ${ipOctets.join('.')}/${initialCidr}</p>`;
    output += `<p><strong>Prefijo Calculado (Nuevo CIDR):</strong> /${desiredCidr}</p>`;
    
    output += `<h3>1. Determinación de Bits y Potencias</h3>`;
    output += `<p><strong>Bits de Host:</strong> ${hostBits} bits, ya que 2^${hostBits} = ${totalAddresses} direcciones totales.</p>`;
    output += `<p><strong>Bits de Subred:</strong> ${borrowedBits} bits, ya que 2^${borrowedBits} = ${subnetCount} subredes.</p>`;
    
    output += `<h3>2. Representación Binaria y Máscara</h3>`;
    output += createBinaryRepresentation(ipOctets, initialCidr, desiredCidr);
    
    // PASO DETALLADO DE LA MÁSCARA
    output += `<h4>Cálculo del Bloque y la Máscara</h4>`;
    output += `<p>1. El cambio de la máscara ocurre en el <strong>Octeto ${maskDetails.octet}</strong>.</p>`;
    output += `<p>2. El <strong>Tamaño del Bloque (Salto)</strong> es: 2^(32-${desiredCidr}) = ${maskDetails.blockSize} direcciones.</p>`;
    output += `<p>3. El valor del <strong>Octeto de Máscara</strong> es la resta de 256 menos el valor del salto para ese octeto:</p>`;
    output += `<p style="margin-left: 20px;">Octeto de Máscara = 256 - Bloque de Salto en Octeto</p>`;
    output += `<p style="margin-left: 20px;">Octeto de Máscara = 256 - ${maskDetails.changingOctetBlock} = ${maskDetails.maskValue}</p>`;
    
    output += `<p><strong>Máscara de Subred Final:</strong> ${maskDetails.maskStr}</p>`;

    output += `<h3>3. Detalles de Subredes (Salto y Rangos)</h3>`;
    output += `<p>El salto entre subredes es de <strong>${maskDetails.changingOctetBlock}</strong> en el Octeto ${maskDetails.octet}.</p>`;
    output += `<h4>Formato Decimal</h4>`;
    output += createSubnetTable(ipOctets, initialCidr, desiredCidr, subnetCount, 'decimal');
    output += `<h4>Formato Binario</h4>`;
    output += createSubnetTable(ipOctets, initialCidr, desiredCidr, subnetCount, 'binary');

    return output;
}

// ----------------------------------------------------------------------
// LÓGICA VLSM (TAMAÑO VARIABLE)
// ----------------------------------------------------------------------

/**
 * Lógica para cálculo VLSM (Subnetting de Tamaño Variable).
 */
function calculateVLSM(ipOctets, initialCidr, hostRequirements) {
    let output = `<h2>Paso a Paso del Cálculo (VLSM)</h2>`;
    output += `<small>Variable Length Subnet Mask (Máscara de Subred de Longitud Variable)</small>`;
    output += `<p><strong>IP de Red Inicial:</strong> ${ipOctets.join('.')}/${initialCidr}</p>`;
    output += `<p><strong>Requisitos de Hosts (ordenados de mayor a menor):</strong> ${hostRequirements.join(', ')}</p>`;
    
    let currentIPint = (ipOctets[0] << 24) + (ipOctets[1] << 16) + (ipOctets[2] << 8) + ipOctets[3];
    const initialNetworkMask = -1 << (32 - initialCidr);
    currentIPint &= initialNetworkMask; 
    
    let subnetDetails = [];
    let failure = null;

    hostRequirements.forEach((requiredHosts, index) => {
        if (failure) return;

        const hostBits = Math.max(2, Math.ceil(Math.log2(requiredHosts + 2)));
        const subnetCidr = 32 - hostBits;
        
        if (subnetCidr < initialCidr) {
            failure = `Error: El requisito de ${requiredHosts} hosts excede el tamaño de la red inicial /${initialCidr}.`;
            return;
        }

        const blocksize = Math.pow(2, hostBits);
        const nextNetAddressInt = currentIPint + blocksize;

        const initialMaxAddress = currentIPint | (~initialNetworkMask);
        if (nextNetAddressInt > initialMaxAddress + 1) { 
            failure = `Error: El requisito de ${requiredHosts} hosts para la Subred ${index + 1} no cabe en el espacio restante de la red inicial.`;
            return;
        }

        subnetDetails.push({
            netAddressInt: currentIPint,
            cidr: subnetCidr,
            requiredHosts: requiredHosts,
            usableHosts: blocksize - 2,
            blocksize: blocksize,
            hostBits: hostBits,
            name: `Subred ${index + 1}`
        });

        currentIPint = nextNetAddressInt;
    });

    if (failure) return `<p style="color: red;">${failure}</p>`;
    
    // Generar la salida de resultados
    
    output += `<h3>1. Asignación Detallada (Paso a Paso)</h3>`;
    subnetDetails.forEach((subnet, index) => {
        const maskDetails = getMaskCalculationDetails(subnet.cidr);
        
        output += `<h4>${subnet.name}: ${subnet.requiredHosts} Hosts (/${subnet.cidr})</h4>`;
        output += `<p><strong>Hosts requeridos:</strong> ${subnet.requiredHosts}</p>`;
        
        // Cálculo de Bits
        output += `<p><strong>Bits de Host:</strong> ${subnet.hostBits} bits, ya que 2^${subnet.hostBits} = ${subnet.blocksize} direcciones totales. (${subnet.blocksize - 2} hosts utilizables).</p>`;
        
        // Cálculo de Máscara
        output += `<h5>Cálculo de Máscara y Bloque (${maskDetails.maskStr})</h5>`;
        output += `<p>El <strong>Tamaño del Bloque (Salto)</strong> es: 2^(32-${subnet.cidr}) = ${maskDetails.blockSize} direcciones.</p>`;
        output += `<p>El octeto que cambia es el ${maskDetails.octet} con un valor de ${maskDetails.changingOctetBlock} (que se resta a 256).</p>`;
        output += `<p><strong>Máscara Asignada:</strong> ${maskDetails.maskStr}</p>`;
        
        // Simulación del tablero (IP y Bits)
        output += createBinaryRepresentationStep(intToIp(subnet.netAddressInt).split('.').map(Number), initialCidr, subnet.cidr); 
    });
    
    output += `<h3>2. Rangos de Subredes VLSM</h3>`;
    output += `<h4>Formato Decimal</h4>`;
    output += createVLSMTable(subnetDetails, 'decimal');
    output += `<h4>Formato Binario</h4>`;
    output += createVLSMTable(subnetDetails, 'binary');

    return output;
}

// ----------------------------------------------------------------------
// FUNCIONES AUXILIARES DE CÁLCULO
// ----------------------------------------------------------------------

/**
 * Calcula los detalles necesarios para explicar la máscara (octeto, bloque, valor).
 */
function getMaskCalculationDetails(cidr) {
    const octet = Math.floor((cidr - 1) / 8) + 1;
    const blockSize = Math.pow(2, 32 - cidr);
    
    // Calcula el valor del salto SÓLO para el octeto que cambia
    const changingOctetBlock = blockSize / Math.pow(2, 8 * (4 - octet));
    const maskValue = 256 - changingOctetBlock;
    const maskStr = cidrToMask(cidr);
    
    return {
        octet: octet,
        blockSize: blockSize,
        changingOctetBlock: changingOctetBlock,
        maskValue: maskValue,
        maskStr: maskStr
    };
}

/**
 * Calcula el nuevo CIDR en función de los hosts o subredes requeridos (CLSM).
 */
function calculateNewCIDR(initialCidr, type, value) {
    let desiredCidr = 0;
    
    if (type === 'hosts') {
        const requiredAddresses = value + 2;
        let hostBits = 0;
        
        while (Math.pow(2, hostBits) < requiredAddresses && hostBits < (32 - initialCidr)) {
            hostBits++;
        }
        
        if (hostBits < 2 || (hostBits === (32 - initialCidr) && Math.pow(2, hostBits) < requiredAddresses)) { 
            return { error: `No es posible satisfacer ${value} hosts dentro de la red inicial /${initialCidr}.` };
        }
        
        desiredCidr = 32 - hostBits;
        return { cidr: desiredCidr, goal: `Mínimo de ${value} Hosts por Subred` };
    } 
    
    else if (type === 'subnets') {
        let borrowedBits = 0;
        const maxBorrowedBits = 30 - initialCidr;

        while (Math.pow(2, borrowedBits) < value && borrowedBits < maxBorrowedBits) {
            borrowedBits++;
        }
        
        desiredCidr = initialCidr + borrowedBits;

        if (desiredCidr > 30) {
             return { error: `No es posible crear ${value} subredes y dejar bits para hosts utilizables.` };
        }
        
        return { cidr: desiredCidr, goal: `Mínimo de ${value} Subredes` };
    }
}

// ----------------------------------------------------------------------
// FUNCIONES AUXILIARES DE FORMATO
// ----------------------------------------------------------------------

function isValidIP(ipAddress) {
    const regex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return regex.test(ipAddress);
}

function cidrToMask(cidr) {
    let mask = '';
    let currentCidr = cidr;
    for (let i = 0; i < 4; i++) {
        let n = Math.min(currentCidr, 8);
        let octetValue = 256 - Math.pow(2, 8 - n); 
        mask += (i > 0 ? '.' : '') + octetValue;
        currentCidr -= n;
    }
    return mask;
}

function decToBinary(dec, bits = 8) {
    return dec.toString(2).padStart(bits, '0');
}

function intToIp(ipInt) {
    return `${(ipInt >>> 24) & 0xFF}.${(ipInt >>> 16) & 0xFF}.${(ipInt >>> 8) & 0xFF}.${ipInt & 0xFF}`;
}

function intToBinaryIp(ipInt) {
    let binStr = (ipInt >>> 0).toString(2).padStart(32, '0');
    return `${binStr.substring(0, 8)}.${binStr.substring(8, 16)}.${binStr.substring(16, 24)}.${binStr.substring(24, 32)}`;
}

/**
 * Genera la representación visual de los bits (Red, Subred, Host) para VLSM.
 */
function createBinaryRepresentationStep(ipOctets, initialCidr, desiredCidr) {
    let binaryIP = ipOctets.map(dec => decToBinary(dec)).join('');
    
    const borrowedBits = desiredCidr - initialCidr;
    const hostBits = 32 - desiredCidr;
    
    let visualOutput = `
        <div class="binary-viz-container">
        <p style="margin: 0; padding-bottom: 5px;"><strong>Dirección de Red:</strong> ${ipOctets.join('.')}/${desiredCidr}</p>
        
        <div style="font-family: var(--font-mono); font-size: 16px; display: inline-block;">`;

    let bitLine = '';
    let ipBits = '';

    // Estilos internos simplificados para la impresión
    const wrapBits = (index, char) => {
        let style = '';
        if (index < initialCidr) {
            style = 'color: #007bff; font-weight: bold;'; // Azul
        } else if (index < desiredCidr) {
            style = 'color: #28a745; font-weight: bold; text-decoration: underline;'; // Verde
        } else {
            style = 'color: #dc3545;'; // Rojo
        }
        return `<span style="${style}">${char}</span>`;
    };
    
    for (let i = 0; i < 32; i++) {
        let spacer = (i > 0 && i % 8 === 0) ? '<span>.</span>' : '';
        ipBits += spacer + wrapBits(i, binaryIP[i]);
        
        // Genera la línea de marcadores para Red/Subred/Host
        if (i < 31) {
            if (i === initialCidr - 1) { 
                bitLine += `<span style="width: 1ch; display: inline-block;">|</span>`;
            } else if (i === desiredCidr - 1) { 
                 bitLine += `<span style="width: 1ch; display: inline-block;">|</span>`;
            } else if ((i + 1) % 8 === 0) { 
                 bitLine += `<span style="width: 1ch; display: inline-block;">.</span>`;
            } else {
                 bitLine += `<span style="width: 1ch; display: inline-block;">&nbsp;</span>`;
            }
        }
    }
    
    visualOutput += `<div>${ipBits}</div>`;
    visualOutput += `<div style="margin-top: 5px; margin-bottom: 5px;">${bitLine}</div>`;
    
    visualOutput += `
        <p style="margin: 0; font-size: 12px;">
            <span style="color: #007bff; font-weight: bold;">Red Original</span> | 
            <span style="color: #28a745; font-weight: bold;">Bits de Subred (${borrowedBits})</span> | 
            <span style="color: #dc3545;">Bits de Host (${hostBits})</span>
        </p>
        </div>
        </div>
    `;

    return visualOutput;
}

/**
 * Genera la representación visual de los bits (Red, Subred, Host) para CLSM.
 */
function createBinaryRepresentation(ipOctets, initialCidr, desiredCidr) {
    let binaryIP = ipOctets.map(dec => decToBinary(dec)).join('');
    
    const borrowedBits = desiredCidr - initialCidr;
    const hostBits = 32 - desiredCidr;
    let visualOutput = `
        <div class="binary-viz-container">
        <p style="margin: 0; padding-bottom: 5px;"><strong>Ejemplo Binario con Prefijo /${desiredCidr}:</strong></p>
        <div style="font-family: var(--font-mono); font-size: 16px; display: flex; gap: 5px; margin-bottom: 10px; flex-wrap: wrap;">`;
    
    const wrapBits = (index, char) => {
        let style = '';
        if (index < initialCidr) {
            style = 'color: #007bff; font-weight: bold;'; // Azul
        } else if (index < desiredCidr) {
            style = 'color: #28a745; font-weight: bold; text-decoration: underline;'; // Verde
        } else {
            style = 'color: #dc3545;'; // Rojo
        }
        return `<span style="${style}">${char}</span>`;
    };

    for (let i = 0; i < 32; i++) {
        if (i > 0 && i % 8 === 0) {
            visualOutput += '<span>.</span>';
        }
        visualOutput += wrapBits(i, binaryIP[i]);
    }

    visualOutput += `
        </div>
        <p style="margin: 0; font-size: 12px;">
            <span style="color: #007bff; font-weight: bold;">Azul: Red Original (${initialCidr} bits)</span> | 
            <span style="color: #28a745; font-weight: bold; text-decoration: underline;">Verde Subrayado: Bits Prestados (${borrowedBits} bits)</span> | 
            <span style="color: #dc3545;">Rojo: Bits de Host (${hostBits} bits)</span>
        </p>
        </div>
    `;

    return visualOutput;
}

/**
 * Crea la tabla de rangos para VLSM.
 */
function createVLSMTable(subnetDetails, format) {
    const isBinary = format === 'binary';
    let tableHtml = `<div class="subnet-table-wrapper">
        <table class="subnet-table" style="font-size: ${isBinary ? '12px' : 'inherit'};">
        <thead>
            <tr>
                <th>Subred (CIDR)</th>
                <th>Dirección de Red</th>
                <th>Primer Host</th>
                <th>Último Host</th>
                <th>Broadcast</th>
            </tr>
        </thead>
        <tbody>`;

    subnetDetails.forEach((subnet) => {
        const netAddressInt = subnet.netAddressInt;
        const blocksize = subnet.blocksize;
        const desiredCidr = subnet.cidr;
        
        const broadcastAddressInt = netAddressInt + blocksize - 1;
        
        const getAddressFormat = (ipInt) => {
            return isBinary ? intToBinaryIp(ipInt) : intToIp(ipInt);
        };

        const netAddress = getAddressFormat(netAddressInt);
        const firstHost = getAddressFormat(netAddressInt + 1);
        const lastHost = getAddressFormat(broadcastAddressInt - 1);
        const broadcastAddress = getAddressFormat(broadcastAddressInt);

        tableHtml += `
            <tr>
                <td><strong>${subnet.name} (/${desiredCidr})</strong></td>
                <td><strong>${netAddress}</strong></td>
                <td>${firstHost}</td>
                <td>${lastHost}</td>
                <td><strong>${broadcastAddress}</strong></td>
            </tr>`;
    });

    tableHtml += `</tbody></table></div>`;
    return tableHtml;
}

/**
 * Crea la tabla de rangos para CLSM.
 */
function createSubnetTable(ipOctets, initialCidr, desiredCidr, subnetCount, format) {
    const isBinary = format === 'binary';
    let tableHtml = `<div class="subnet-table-wrapper">
        <table class="subnet-table" style="font-size: ${isBinary ? '12px' : 'inherit'};">
        <thead>
            <tr>
                <th>Subred #</th>
                <th>Dirección de Red</th>
                <th>Primer Host</th>
                <th>Último Host</th>
                <th>Broadcast</th>
            </tr>
        </thead>
        <tbody>`;

    const totalAddresses = Math.pow(2, 32 - desiredCidr);
    const numSubnetsToShow = Math.min(subnetCount, 8);
    const blocksize = totalAddresses;
    
    let currentIPint = (ipOctets[0] << 24) + (ipOctets[1] << 16) + (ipOctets[2] << 8) + ipOctets[3];
    const initialNetworkMask = -1 << (32 - initialCidr);
    currentIPint &= initialNetworkMask; 
    
    const getAddressFormat = (ipInt) => {
        return isBinary ? intToBinaryIp(ipInt) : intToIp(ipInt);
    };

    for (let i = 0; i < numSubnetsToShow; i++) {
        const netAddressInt = currentIPint + (i * blocksize);
        const broadcastAddressInt = netAddressInt + blocksize - 1;
        
        const netAddress = getAddressFormat(netAddressInt);
        const firstHost = getAddressFormat(netAddressInt + 1);
        const lastHost = getAddressFormat(broadcastAddressInt - 1);
        const broadcastAddress = getAddressFormat(broadcastAddressInt);

        tableHtml += `
            <tr>
                <td><strong>${i}</strong></td>
                <td><strong>${netAddress}/${desiredCidr}</strong></td>
                <td>${firstHost}/${desiredCidr}</td>
                <td>${lastHost}/${desiredCidr}</td>
                <td><strong>${broadcastAddress}/${desiredCidr}</strong></td>
            </tr>`;
    }

    tableHtml += `
        </tbody>
        </table></div>`;
        
    if (subnetCount > numSubnetsToShow) {
        tableHtml += `<p style="margin-top: 10px; color: #6c757d;">... Se muestran solo las primeras ${numSubnetsToShow} de ${subnetCount} subredes.</p>`;
    }
    
    return tableHtml;
}

// ----------------------------------------------------------------------
// FUNCIONALIDAD DE IMPRESIÓN / PDF DETALLADO
// ----------------------------------------------------------------------

/**
 * Obtiene la fecha y hora actual en formato legible.
 */
function getFormattedDateTime() {
    const now = new Date();
    const date = now.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const time = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return `${date} - ${time}`;
}

/**
 * Prepara el contenido para la impresión, añade metadatos y lanza el diálogo de impresión.
 */
function printResults() {
    const resultsContainer = document.getElementById('results-container');
    const authorName = document.getElementById('author-name').value || 'Anónimo';

    if (resultsContainer.innerHTML.includes('<h2>Resultados del Cálculo</h2>')) {
        // Asumiendo que solo tiene el mensaje inicial
        alert('Por favor, realiza un cálculo primero antes de imprimir.');
        return;
    }

    // 1. Crear un contenedor temporal para la impresión
    const printWindow = window.open('', '', 'height=600,width=800');
    
    // 2. Crear encabezado y contenido
    const headerHtml = `
        <div style="margin-bottom: 30px;">
            <h1 style="color: #333; text-align: center; margin-bottom: 20px; font-size: 24px; border-bottom: 2px solid #333; padding-bottom: 10px;">
                Reporte Detallado de Subnetting
            </h1>
            <div style="border: 1px solid #ccc; padding: 15px; margin-bottom: 20px; font-size: 14px; background-color: #f0f0f0;">
                <strong>Realizado por:</strong> ${authorName} <br>
                <strong>Fecha de Reporte:</strong> ${getFormattedDateTime()} <br>
                <strong>Herramienta:</strong> Calculadora de Subnetting IP
            </div>
        </div>
    `;

    // 3. Escribir el HTML completo para la impresión
    printWindow.document.write('<!DOCTYPE html><html><head><title>Reporte de Subnetting</title>');
    
    // Incluir estilos optimizados para impresión
    printWindow.document.write('<style>');
    printWindow.document.write(`
        body { font-family: 'Roboto', sans-serif; color: #000; margin: 30px; }
        h1 { color: #1e88e5; border-bottom: 2px solid #1e88e5; padding-bottom: 10px; margin-top: 0; }
        h2 { color: #1e88e5; border-left: 5px solid #ff7043; padding-left: 10px; font-size: 1.4rem; }
        h3, h4, h5 { color: #333; }
        p strong { color: #ff7043; font-weight: bold; }
        /* Tablas */
        .subnet-table-wrapper { overflow: visible; }
        .subnet-table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 10pt; table-layout: fixed; }
        .subnet-table th, .subnet-table td { border: 1px solid #ccc; padding: 8px 5px; text-align: center; word-wrap: break-word; }
        .subnet-table thead th { background-color: #1e88e5; color: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .subnet-table tbody tr:nth-child(even) { background-color: #f2f2f2; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        /* Visualización Binaria */
        .binary-viz-container {
            border: 1px solid #ccc; padding: 10px; margin: 15px 0; background-color: #f8f8f8;
            -webkit-print-color-adjust: exact; print-color-adjust: exact;
        }
        .binary-viz-container p { font-size: 12px; }
    `);
    printWindow.document.write('</style>');
    printWindow.document.write('</head><body>');
    
    // 4. Escribir el contenido
    printWindow.document.write(headerHtml);
    printWindow.document.write(resultsContainer.innerHTML);
    
    printWindow.document.write('</body></html>');
    printWindow.document.close();
    
    // 5. Iniciar la impresión
    printWindow.focus();
    printWindow.print();
    // No cerramos la ventana automáticamente ya que el diálogo de impresión
    // del navegador podría cerrarla si se cancela o completa.
}