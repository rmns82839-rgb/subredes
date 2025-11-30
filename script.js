 /**
         * Lógica principal para la calculadora de Subnetting IP (CLSM y VLSM),
         * con persistencia de datos usando localStorage.
         */

        // ====================================================================
        // CONFIGURACIÓN DE LOCAL STORAGE (PERSISTENCIA DE DATOS)
        // ====================================================================
        const LOCAL_STORAGE_KEY = 'subnettingAppData';

        /**
         * Guarda el estado actual de los inputs y los resultados en localStorage.
         */
        function saveInputState() {
            try {
                const ipAddress = document.getElementById('ip-address').value;
                const cidr = document.getElementById('cidr').value;
                const clsmSubnets = document.getElementById('clsm-subnets').value;
                const calculationType = document.querySelector('input[name="calculation-type"]:checked').value;
                
                // Capturar los requisitos de hosts VLSM
                const vlsmRequirements = Array.from(document.querySelectorAll('#host-requirements-list .vlsm-host-input'))
                                            .map(input => ({ value: input.value, placeholder: input.placeholder }));

                // Capturar el contenido de los resultados para persistencia
                const resultsHTML = document.getElementById('results-output').innerHTML;
                const stepsHTML = document.getElementById('step-by-step-output').innerHTML;

                const dataToSave = {
                    ipAddress,
                    cidr,
                    clsmSubnets,
                    calculationType,
                    vlsmRequirements,
                    resultsHTML,
                    stepsHTML
                };

                localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(dataToSave));
                // console.log("Estado de la aplicación guardado con éxito en localStorage.");
                
            } catch (error) {
                console.error("Error al guardar el estado en localStorage:", error);
            }
        }


        /**
         * Carga el estado guardado desde localStorage y restaura la UI.
         */
        function loadInputState() {
            try {
                const storedData = localStorage.getItem(LOCAL_STORAGE_KEY);
                if (!storedData) {
                    // console.log("No hay estado guardado previamente en localStorage.");
                    return;
                }

                const data = JSON.parse(storedData);
                
                // 1. Restaurar Inputs
                document.getElementById('ip-address').value = data.ipAddress || '';
                document.getElementById('cidr').value = data.cidr || 24;
                document.getElementById('clsm-subnets').value = data.clsmSubnets || '';
                
                // 2. Restaurar Tipo de Cálculo (CLSM/VLSM)
                const typeInput = document.getElementById(data.calculationType);
                if (typeInput) {
                    typeInput.checked = true;
                    toggleCLSMInputs(data.calculationType === 'clsm');
                } else {
                     // Si no hay tipo guardado, usar el default (CLSM)
                    document.getElementById('clsm').checked = true;
                    toggleCLSMInputs(true);
                }

                // 3. Restaurar Requisitos VLSM
                const hostList = document.getElementById('host-requirements-list');
                // Limpiar la lista actual
                while (hostList.children.length > 0) {
                    hostList.removeChild(hostList.lastChild);
                }
                
                // Restaurar los requisitos guardados
                if (data.vlsmRequirements && data.vlsmRequirements.length > 0) {
                    data.vlsmRequirements.forEach((req, index) => {
                        addHostInput(req.value || '', req.placeholder || `Hosts para Subred ${index + 1}`);
                    });
                } else {
                     // Asegurar que al menos haya un campo VLSM si no hay datos
                    addHostInput('', `Hosts para Subred 1`);
                }


                // 4. Restaurar Resultados y Paso a Paso
                document.getElementById('results-output').innerHTML = data.resultsHTML || '<p>Ingrese los datos y presione "CALCULAR SUBREDES" para ver los resultados.</p>';
                document.getElementById('step-by-step-output').innerHTML = data.stepsHTML || '<p>El proceso detallado de la segmentación se mostrará aquí.</p>';
                
                // 5. Re-renderizar MathJax
                if (window.MathJax) {
                    window.MathJax.typesetPromise();
                }

                // console.log("Estado de la aplicación cargado con éxito desde localStorage.");
            } catch (error) {
                console.error("Error al cargar el estado desde localStorage:", error);
            }
        }


        /**
         * Borra el estado guardado en localStorage y refresca la página.
         */
        function clearAll() {
            // Utilizamos un modal sencillo en lugar de alert/confirm
            const customConfirm = document.getElementById('custom-confirm-modal');
            if (customConfirm) {
                 customConfirm.remove();
            }

            if (!window.confirm('¿Estás seguro de que quieres borrar todos los datos guardados localmente y recargar la página?')) {
                return;
            }
            
            try {
                localStorage.removeItem(LOCAL_STORAGE_KEY);
                console.log("Datos de persistencia eliminados con éxito. Recargando...");
                window.location.reload(); 
            } catch (error) {
                console.error("Error al eliminar el estado de localStorage:", error);
                window.location.reload();
            }
        }

        // ====================================================================
        // CALCULADORA DE EXPONENTES
        // ====================================================================

        /**
         * Calcula 2 elevado a la 'n' y muestra el resultado en la UI.
         */
        function calculateExponent() {
            const inputElement = document.getElementById('exponent-input');
            const outputElement = document.getElementById('exponent-output');
            const n = parseInt(inputElement.value, 10);

            if (isNaN(n) || n < 0 || n > 31) {
                outputElement.innerHTML = `<span class="error-message">Por favor, ingrese un número entre 0 y 31.</span>`;
                return;
            }

            const result = Math.pow(2, n);
            const resultString = result.toLocaleString('es-ES'); // Formato de miles
            
            outputElement.innerHTML = `
                $$2^{${n}} = ${resultString}$$
            `;
            
            // Re-renderizar MathJax solo en esta sección
            if (window.MathJax) {
                window.MathJax.typesetPromise([outputElement]).catch(err => console.log('MathJax error in exponent:', err));
            }
        }


        // ====================================================================
        // LÓGICA DE SUBREDES (CLSM/VLSM)
        // ====================================================================
        
        /**
         * Convierte un número entero de 32 bits a una cadena binaria de 32 bits,
         * dividida en octetos.
         * @param {number} ipInt Entero de 32 bits que representa la IP.
         * @param {number} startCidr CIDR inicial.
         * @param {number} newCidr CIDR de la subred (para colorear).
         * @param {('red'|'mask'|'broadcast')} type Tipo de coloración de bits.
         * @returns {string} HTML formateado con bits coloreados.
         */
        function formatBinaryStep(ipInt, startCidr, newCidr, type) {
            // >>> 0 asegura que el número se trate como un entero sin signo de 32 bits
            let binary32 = (ipInt >>> 0).toString(2).padStart(32, '0');
            let html = '';

            for (let i = 0; i < 4; i++) {
                const octet = binary32.substring(i * 8, (i + 1) * 8);
                let octetHtml = '';

                for (let j = 0; j < 8; j++) {
                    const bitIndex = i * 8 + j + 1;
                    const bit = octet[j];
                    let className = 'bit-zero';

                    if (type === 'mask') {
                        // Coloración para Máscara: 1s hasta newCidr, 0s después
                        className = bitIndex <= newCidr ? 'bit-one' : 'bit-zero';
                    } else { 
                        // Coloración para IP/Red/Broadcast
                        if (bitIndex <= newCidr) {
                             // Bits de Red/Subred
                            if (bitIndex <= startCidr) {
                                className = 'bit-one'; // Bits de Red originales (1)
                            } else {
                                className = 'bit-subnet'; // Bits de Subred (prestados, 1)
                            }
                        } else {
                            // Bits de Host
                            if (type === 'broadcast') {
                                className = 'bit-one'; // Bits de Host a 1 (Broadcast)
                            } else {
                                className = 'bit-zero'; // Bits de Host a 0 (ID de Red)
                            }
                        }
                        
                        // Si el bit es 0, forzamos el color gris (bit-zero)
                        if (bit === '0' && className !== 'bit-zero') {
                            className = 'bit-zero'; 
                        }
                    }

                    octetHtml += `<span class="${className}">${bit}</span>`;
                }

                html += `<div class="octet-group">${octetHtml}</div>`;
            }
            return html;
        }


        /**
         * Valida la dirección IP y el CIDR.
         */
        function validateInput(ipAddress, cidr) {
            const octets = ipAddress.split('.').map(Number);
            if (octets.length !== 4 || octets.some(o => isNaN(o) || o < 0 || o > 255)) {
                return { isValid: false, message: "La dirección IP es inválida.", ipOctets: [] };
            }
            if (isNaN(cidr) || cidr < 0 || cidr > 32) {
                return { isValid: false, message: "El CIDR es inválido (debe estar entre 0 y 32).", ipOctets: [] };
            }
            return { isValid: true, message: "", ipOctets: octets };
        }

        /**
         * Convierte un número CIDR a máscara de subred en formato decimal.
         */
        function cidrToMask(cidr) {
            let mask = [];
            let tempCidr = cidr;
            for (let i = 0; i < 4; i++) {
                let octet = 0;
                for (let j = 0; j < 8; j++) {
                    if (tempCidr > 0) {
                        octet += Math.pow(2, 7 - j);
                        tempCidr--;
                    }
                }
                mask.push(octet);
            }
            return mask.join('.');
        }

        /**
         * Convierte un array de octetos IP a un entero de 32 bits.
         */
        function ipOctetsToInt(ipOctets) {
            // Usamos | 0 para asegurar que el resultado es un entero
            return (ipOctets[0] << 24) + (ipOctets[1] << 16) + (ipOctets[2] << 8) + ipOctets[3];
        }

        /**
         * Convierte un entero de 32 bits a un string de IP DOT decimal.
         */
        function ipIntToDotDecimal(ipInt) {
             // >>> 0 asegura el comportamiento de unsigned int
             return [
                (ipInt >>> 24) & 0xFF,
                (ipInt >>> 16) & 0xFF,
                (ipInt >>> 8) & 0xFF,
                ipInt & 0xFF
            ].join('.');
        }


        /**
         * Realiza el cálculo de Subnetting (CLSM o VLSM) y genera el paso a paso.
         */
        function calculateSubnetting() {
            const ipAddress = document.getElementById('ip-address').value.trim();
            const cidr = parseInt(document.getElementById('cidr').value, 10);
            const calculationType = document.querySelector('input[name="calculation-type"]:checked').value;
            const resultsDiv = document.getElementById('results-output');
            const stepsDiv = document.getElementById('step-by-step-output');
            
            resultsDiv.innerHTML = '';
            stepsDiv.innerHTML = '';

            const validation = validateInput(ipAddress, cidr);
            if (!validation.isValid) {
                resultsDiv.innerHTML = `<p class="error-message">${validation.message}</p>`;
                saveInputState();
                return;
            }

            const ipOctets = validation.ipOctets;
            const steps = [];
            let subnets = [];
            
            // Calculamos la IP de Red inicial con la máscara original
            const initialMaskInt = (0xFFFFFFFF << (32 - cidr)) >>> 0;
            let currentIpInt = ipOctetsToInt(ipOctets);
            const networkStartInt = currentIpInt & initialMaskInt;
            currentIpInt = networkStartInt; // La IP de inicio es el ID de la red base


            steps.push({
                title: "Paso 1: Validación y Parámetros Iniciales",
                content: `Dirección IP: \`${ipAddress}\`. Prefijo CIDR Inicial: \`/${cidr}\`. Tipo de Cálculo: ${calculationType.toUpperCase()}.`,
                math: null
            });
            
            // =============================================================
            // CLSM (Máscara de Subred Fija)
            // =============================================================
            if (calculationType === 'clsm') {
                const requiredSubnetsInput = document.getElementById('clsm-subnets').value;
                const requiredSubnets = parseInt(requiredSubnetsInput, 10);

                if (isNaN(requiredSubnets) || requiredSubnets < 2) {
                    resultsDiv.innerHTML = `<p class="error-message">Para CLSM, ingrese un número de subredes mayor o igual a 2.</p>`;
                    saveInputState();
                    return;
                }

                // Paso 2: Cálculo de bits de subred
                let bitsNeeded = 0;
                while (Math.pow(2, bitsNeeded) < requiredSubnets) {
                    bitsNeeded++;
                }
                const totalSubnets = Math.pow(2, bitsNeeded);
                const newCidr = cidr + bitsNeeded;

                if (newCidr > 30) { 
                    resultsDiv.innerHTML = `<p class="error-message">No es posible segmentar. Se requiere un CIDR /${newCidr}, excediendo el límite usable de /30 para tener hosts usables.</p>`;
                    saveInputState();
                    return;
                }
                
                // Cálculo de Hosts
                const hostBits = 32 - newCidr;
                const totalHostsPerSubnet = Math.pow(2, hostBits);
                const usableHostsPerSubnet = totalHostsPerSubnet - 2;
                const newMask = cidrToMask(newCidr);
                const newMaskInt = (0xFFFFFFFF << (32 - newCidr)) >>> 0;
                
                // MÁSCARA BINARIA INICIAL
                const initialIpInt = ipOctetsToInt(ipOctets);

                steps.push({
                    title: "Paso 2: Bits de Subred y Nueva Máscara",
                    content: `Se necesitan ${requiredSubnets} subredes. Se busca 'n' tal que $2^n \\ge ${requiredSubnets}$.`,
                    math: `\\text{Bits de Subred (n)} = ${bitsNeeded} \\quad (2^{${bitsNeeded}} = ${totalSubnets})`,
                    details: `Nuevo CIDR: $/${newCidr}$. Máscara: ${newMask}.`
                });
                
                steps.push({
                    title: "Paso 3: Hosts por Subred y Salto de Bloque",
                    content: `Se calcula el total de hosts con ${hostBits} bits de host.`,
                    math: `\\text{Total Direcciones} = 2^{${hostBits}} = ${totalHostsPerSubnet} \\quad \\text{Hosts Usables} = ${usableHostsPerSubnet}`,
                    details: `Tamaño del salto (Bloque): ${totalHostsPerSubnet} direcciones.`
                });
                
                // Paso 4: Asignación de Subredes
                steps.push({
                    title: "Paso 4: Cálculo Binario de la Primera Subred",
                    content: `Se realiza el *AND* lógico entre la IP original y la Nueva Máscara /${newCidr} para obtener el ID de Red.`,
                    math: null,
                    binary: {
                        cidr: newCidr,
                        startCidr: cidr,
                        lines: [
                            { label: "IP Base", value: initialIpInt, type: 'red' },
                            { label: "Máscara", value: newMaskInt, type: 'mask', operation: '&' },
                            { label: "ID de Red", value: networkStartInt, type: 'red' }
                        ]
                    }
                });

                // Iteración de Subredes
                for (let i = 0; i < requiredSubnets; i++) {
                    const networkInt = currentIpInt;
                    const broadcastInt = networkInt + totalHostsPerSubnet - 1;

                    const networkId = ipIntToDotDecimal(networkInt);
                    const broadcastId = ipIntToDotDecimal(broadcastInt);
                    const firstHost = ipIntToDotDecimal(networkInt + 1);
                    const lastHost = ipIntToDotDecimal(broadcastInt - 1);


                    subnets.push({
                        name: `Subred ${i + 1}`,
                        cidr: newCidr,
                        mask: newMask,
                        networkId: networkId,
                        firstHost: firstHost,
                        lastHost: lastHost,
                        broadcastId: broadcastId,
                        hostsUsable: usableHostsPerSubnet
                    });
                    
                    // Avance al siguiente Network ID
                    currentIpInt += totalHostsPerSubnet;
                    
                    // Detalle del paso por subred
                    steps.push({
                        title: `Subred ${i + 1}: Detalle de Direcciones`,
                        content: `
                            Red: ${networkId} (Salto de ${totalHostsPerSubnet} direcciones). 
                            Máscara: ${newMask}.
                            Rango de Hosts: ${firstHost} a ${lastHost}.
                            Broadcast: ${broadcastId}.
                        `,
                        math: null
                    });
                }
            } 
            // =============================================================
            // VLSM (Máscara de Subred Variable)
            // =============================================================
            else if (calculationType === 'vlsm') {
                const requirements = Array.from(document.querySelectorAll('#host-requirements-list .vlsm-host-input'))
                                        .map(input => parseInt(input.value, 10))
                                        .filter(val => val > 0);

                if (requirements.length === 0) {
                    resultsDiv.innerHTML = `<p class="error-message">Para VLSM, debe ingresar al menos un requisito de Host.</p>`;
                    saveInputState();
                    return;
                }

                // Paso 2: Ordenamiento
                const sortedRequirements = [...requirements].sort((a, b) => b - a);
                steps.push({
                    title: "Paso 2: Ordenamiento de Requerimientos de Hosts (VLSM)",
                    content: `Requisitos de hosts ordenados de mayor a menor para el cálculo VLSM: ${sortedRequirements.join(', ')} hosts.`,
                    math: null
                });

                // Paso 3: Iteración de Subredes
                steps.push({
                    title: "Paso 3: Cálculo y Asignación de Subredes (Iterativo)",
                    content: `Se comienza desde la dirección de red inicial, determinando la máscara mínima (/CIDR) para satisfacer el requisito de hosts más grande.`,
                    math: null
                });

                sortedRequirements.forEach((req, index) => {
                    // Determinar 'n' bits de host
                    let hostBits = 0;
                    while (Math.pow(2, hostBits) - 2 < req && hostBits < 32) {
                        hostBits++;
                    }
                    
                    if (hostBits > 32 - cidr) { 
                         steps.push({
                            title: `Subred ${index + 1} (Req: ${req}) - ¡ERROR!`,
                            content: `No es posible crear esta subred. Se necesitan ${hostBits} bits de host, pero el prefijo original /${cidr} solo permite ${32 - cidr} bits de host.`,
                            math: null
                        });
                        return; // Saltar esta subred si es imposible
                    }
                    
                    if (hostBits < 2) { 
                         steps.push({
                            title: `Subred ${index + 1} (Req: ${req}) - ¡ERROR!`,
                            content: `Requisito de Hosts (${req}) es demasiado bajo. Se necesitan al menos 2 hosts usables, lo que requiere 2 bits de host (CIDR /30).`,
                            math: null
                        });
                        return; // Saltar esta subred si es imposible
                    }

                    const totalHosts = Math.pow(2, hostBits);
                    const usableHosts = totalHosts - 2;
                    const newCidr = 32 - hostBits;
                    const newMask = cidrToMask(newCidr);
                    const newMaskInt = (0xFFFFFFFF << (32 - newCidr)) >>> 0;

                    // Calcular Network ID a partir del currentIpInt
                    const networkInt = currentIpInt;
                    const broadcastInt = networkInt + totalHosts - 1;
                    
                    // Conversión a DOT decimal para la tabla
                    const networkId = ipIntToDotDecimal(networkInt);
                    const broadcastId = ipIntToDotDecimal(broadcastInt);
                    const firstHost = ipIntToDotDecimal(networkInt + 1);
                    const lastHost = ipIntToDotDecimal(broadcastInt - 1);


                    subnets.push({
                        name: `Subred ${index + 1} (Hosts: ${req})`,
                        cidr: newCidr,
                        mask: newMask,
                        networkId: networkId,
                        firstHost: firstHost,
                        lastHost: lastHost,
                        broadcastId: broadcastId,
                        hostsUsable: usableHosts
                    });

                    // Avance al siguiente Network ID (salto de bloque)
                    currentIpInt = broadcastInt + 1;

                    // Detalle del paso por subred con binario
                    steps.push({
                        title: `Subred ${index + 1} (Requerimiento: ${req} hosts)`,
                        content: `
                            Cálculo: $2^n$ que contenga a ${req} hosts $\\rightarrow 2^{${hostBits}} - 2 = ${usableHosts}$.
                            Nuevo CIDR: $/${newCidr}$. Máscara: ${newMask}.
                        `,
                        math: null,
                        binary: {
                            cidr: newCidr,
                            startCidr: cidr,
                            lines: [
                                { label: "IP Red", value: networkInt, type: 'red' },
                                { label: "Máscara", value: newMaskInt, type: 'mask', operation: '&' },
                                { label: "ID Red", value: networkInt, type: 'red' },
                                { label: "Broadcast", value: broadcastInt, type: 'broadcast' }
                            ]
                        }
                    });
                });
            }

            // =============================================================
            // MOSTRAR RESULTADOS FINALES Y PASO A PASO
            // =============================================================
            printResults(subnets, resultsDiv);
            displayStepByStep(steps, stepsDiv);
            saveInputState();
        }

        /**
         * Muestra los resultados finales en formato de tabla.
         */
        function printResults(subnets, targetElement) {
            if (subnets.length === 0) {
                 targetElement.innerHTML = `<p class="error-message">No se pudieron generar subredes o la entrada es inválida.</p>`;
                 return;
            }

            let html = `
                <h3 class="section-title">Resultados Finales del Subnetting</h3>
                <div class="results-table-container">
                    <table class="results-table">
                        <thead>
                            <tr>
                                <th>Subred</th>
                                <th>Máscara (/CIDR)</th>
                                <th>ID de Red</th>
                                <th>Primer Host</th>
                                <th>Último Host</th>
                                <th>ID de Broadcast</th>
                                <th>Hosts Usables</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            subnets.forEach(subnet => {
                html += `
                    <tr>
                        <td>${subnet.name}</td>
                        <td>${subnet.mask} (/${subnet.cidr})</td>
                        <td>${subnet.networkId}</td>
                        <td>${subnet.firstHost}</td>
                        <td>${subnet.lastHost}</td>
                        <td>${subnet.broadcastId}</td>
                        <td>${subnet.hostsUsable.toLocaleString('es-ES')}</td>
                    </tr>
                `;
            });

            html += `
                        </tbody>
                    </table>
                </div>
            `;
            targetElement.innerHTML = html;
        }

        /**
         * Muestra el proceso detallado de cálculo (Paso a Paso).
         */
        function displayStepByStep(steps, targetElement) {
            if (steps.length === 0) return;

            let html = `
                <h3 class="section-title step-by-step-title">Paso a Paso del Cálculo</h3>
                <div class="step-list">
            `;

            steps.forEach((step, index) => {
                let binaryHtml = '';
                if (step.binary) {
                    const { lines, cidr, startCidr } = step.binary;
                    binaryHtml += `<div class="binary-container">`;
                    
                    // Mostrar octetos decimales arriba
                    binaryHtml += `<div class="binary-line">`;
                    binaryHtml += `<span class="binary-label">Octeto:</span>`;
                    for(let i=0; i<4; i++) {
                        binaryHtml += `<span class="octet-decimal"> ${i+1} </span>`;
                    }
                    binaryHtml += `</div>`;

                    lines.forEach(line => {
                        const dotDecimal = ipIntToDotDecimal(line.value);
                        
                        binaryHtml += `<div class="binary-line">`;
                        if (line.operation) {
                             binaryHtml += `<span class="operation">${line.operation}</span>`;
                        } else {
                            binaryHtml += `<span class="binary-label">${line.label}:</span>`;
                        }
                        
                        binaryHtml += formatBinaryStep(line.value, startCidr, cidr, line.type);
                        binaryHtml += `<span class="binary-separator">=</span> <span class="binary-label">${dotDecimal}</span>`;
                        binaryHtml += `</div>`;
                    });

                    binaryHtml += `</div>`;
                }

                html += `
                    <div class="step-card">
                        <div class="step-header">
                            <span class="step-number">#${index + 1}</span>
                            <h4 class="step-title">${step.title}</h4>
                        </div>
                        <div class="step-content">
                            <p>${step.content}</p>
                            ${step.details ? `<p class="step-details">${step.details}</p>` : ''}
                            ${step.math ? `<div class="step-math">\$${step.math}\$</div>` : ''}
                            ${binaryHtml}
                        </div>
                    </div>
                `;
            });

            html += `
                </div>
                <p class="final-note">El cálculo ha finalizado. Los resultados detallados se encuentran en la sección anterior.</p>
            `;
            targetElement.innerHTML = html;

            // Re-renderizar MathJax después de insertar el nuevo contenido
            if (window.MathJax) {
                setTimeout(() => {
                    window.MathJax.typesetPromise([targetElement]).catch(err => console.log('MathJax error during typesetting:', err));
                }, 100); 
            }
        }

        // ====================================================================
        // MANEJO DE UI Y EVENTOS
        // ====================================================================
        
        /**
         * Alterna la visibilidad de los controles CLSM/VLSM.
         */
        function toggleCLSMInputs(isClsm) {
            document.getElementById('clsm-controls').classList.toggle('hidden', !isClsm);
            document.getElementById('vlsm-controls').classList.toggle('hidden', isClsm);
        }

        /**
         * Añade un campo de input para requisitos VLSM.
         * @param {string} initialValue Valor inicial para el input.
         * @param {string} placeholderText Texto del placeholder.
         */
        function addHostInput(initialValue = '', placeholderText = '') {
            const list = document.getElementById('host-requirements-list');
            const count = list.querySelectorAll('.vlsm-host-input').length + 1;
            const newGroup = document.createElement('div');
            newGroup.classList.add('vlsm-input-group');
            
            // Si el texto del placeholder no viene de la carga, generar uno por defecto
            if (!placeholderText) {
                placeholderText = `Hosts para Subred ${count}`;
            }

            newGroup.innerHTML = `
                <input type="number" class="vlsm-host-input" min="1" placeholder="${placeholderText}" value="${initialValue}" onchange="saveInputState()">
                <button type="button" class="remove-host-btn" onclick="removeHostInput(this)">-</button>
            `;
            list.appendChild(newGroup);
            saveInputState();
        }

        /**
         * Elimina un campo de input para requisitos VLSM.
         */
        function removeHostInput(button) {
            const group = button.closest('.vlsm-input-group');
            const list = document.getElementById('host-requirements-list');
            
            // Cambiado de alert() a un mensaje en la UI
            const msgElement = document.getElementById('vlsm-error-message');
            msgElement.textContent = ''; 

            if (list.children.length > 1) {
                group.remove();
                saveInputState();
            } else {
                msgElement.textContent = 'Debe haber al menos un requisito de Host.';
                setTimeout(() => msgElement.textContent = '', 3000);
            }
        }

        // ====================================================================
        // INICIALIZACIÓN DE LA APLICACIÓN
        // ====================================================================
        document.addEventListener('DOMContentLoaded', () => {
            // 1. Cargar el estado guardado desde localStorage
            loadInputState();
            
            // 2. Si no había datos guardados, asegurar que CLSM esté activo y haya un input VLSM
            const clsmRadio = document.getElementById('clsm');
            if (!document.querySelector('input[name="calculation-type"]:checked')) {
                 clsmRadio.checked = true;
            }
            if (document.getElementById('host-requirements-list').children.length === 0) {
                 addHostInput('', `Hosts para Subred 1`);
            }
            toggleCLSMInputs(clsmRadio.checked);
            
            // 3. Calcular exponente inicial
            calculateExponent();
        });
        
