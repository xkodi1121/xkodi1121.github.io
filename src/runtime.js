document.addEventListener("DOMContentLoaded", () => {
    let controller = new AbortController();
    const checkButton = document.getElementById("check");
    const clearButton = document.getElementById("clear");
    const downloadButton = document.getElementById("dl");
    const fileInput = document.getElementById("file");
    const urlInput = document.getElementById("playlisturl");
    const tableBody = document.querySelector("tbody");
    const scanIndicator = document.getElementById("scind");
    let activeChannels = [];
    let totalChannels = 0;
    // Initially disable the download button
    downloadButton.disabled = true;

    checkButton.addEventListener("click", async (event) => {
        event.preventDefault();
        tableBody.innerHTML = ""; // Clear existing table rows
        activeChannels = []; // Clear the active channels list for a new check
        let playlistContent = "";

        if (urlInput.value) {
            playlistContent = await fetchM3UFromURL(urlInput.value);
        } else if (fileInput.files.length > 0) {
            playlistContent = await readM3UFile(fileInput.files[0]);
        } else {
            scanIndicator.textContent = "Greška: Nema playliste, Pokušaj ponovo";
            
            return;
        }

        if (playlistContent) {
            const channels = parseM3U(playlistContent);
            totalChannels = channels.length;
            scanIndicator.textContent = "Status: Pretražujem (0%)";
            await checkChannels(parseM3U(playlistContent));
            if (!controller.signal.aborted) {
                scanIndicator.textContent = "Status: Preuzimanje spremno";
                downloadButton.disabled = false; // Enable the download button
                clearButton.disabled = false;
                checkButton.disabled = false;
            }
        }
    });

    clearButton.addEventListener("click", (event) => {
        event.preventDefault();
        // Abort ongoing requests
        controller.abort();
        // Reset everything
        tableBody.innerHTML = "";
        fileInput.value = "";
        urlInput.value = "";
        activeChannels = [];
        scanIndicator.textContent = "Status: Spremno / Čekam datoteku...";
        downloadButton.disabled = true; // Disable the download button
        // Create a new AbortController for future requests
        controller = new AbortController();
    });

    downloadButton.addEventListener("click", (event) => {
        if (activeChannels.length === 0) {
            scanIndicator.textContent= "Error: Nema aktivnih kanala za preuzimanje. Klikni prvo provjeru.";
            return;
        }
        downloadActiveChannels();
    });

    async function fetchM3UFromURL(url) {
        try {
            const response = await fetch(url, { signal: controller.signal });
            if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);
            return await response.text();
        } catch (error) {
            if (error.name === 'AbortError') {
                scanIndicator.textContent = "Status: Provjera prekinuta.";
            } else {
                scanIndicator.textContent = "Greška: dohvaćanje M3U datoteke. Provjeri URL i pokušaj ponovo.";
                console.error(error);
            }
            return "";
        }
    }

    function readM3UFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => resolve(event.target.result);
            reader.onerror = (error) => {
                scanIndicator.textContent="Greška: čitanje datoteke. Pokušaj ponovo.";
                console.error(error);
                reject("");
            };
            reader.readAsText(file);
        });
    }

    function parseM3U(content) {
        const lines = content.split("\n");
        const channels = [];
        let channelInfo = {};

        lines.forEach((line) => {
            if (line.startsWith("#EXTINF")) {
                const nameMatch = line.match(/,(.*)$/);
                channelInfo.name = nameMatch ? nameMatch[1] : "Nepoznati kanali";
            } else if (line.startsWith("http")) {
                channelInfo.url = line.trim();
                channels.push({ ...channelInfo });
                channelInfo = {}; // Reset for next channel
            }
        });

        return channels;
    }

    async function checkChannels(channels) {
        for (const [index, channel] of channels.entries()) {
            checkButton.disabled = true;
            clearButton.disabled = true;
            const row = document.createElement("tr");
            row.innerHTML = `
                <th scope="row">${index + 1}</th>
                <td>${channel.name}</td>
                <td>Checking...</td>
                <td>Loading...</td>
            `;
            tableBody.appendChild(row);

            try {
                const status = await checkChannelStatus(channel.url);
                row.children[2].textContent = status.online ? "Online" : "Offline";
                row.children[3].textContent = status.code;

                if (status.online) {
                    activeChannels.push(channel); // Add active channel to the list
                }
            } catch (error) {
                row.children[2].textContent = "Error";
                row.children[3].textContent = "Network Error";
            }

            const percentage = Math.round(((index + 1) / totalChannels) * 100);
            scanIndicator.textContent = `Status: Pretražujem (${percentage}%)`;

            // Check if the scan was aborted
            if (controller.signal.aborted) {
                scanIndicator.textContent = "Status: Pretraga prekinuta.";
                downloadButton.disabled = true; 
                break;
            }
        }
    }

    async function checkChannelStatus(url) {
        try {
            const response = await fetch(url, { method: "HEAD", signal: controller.signal });
            return { online: response.ok, code: response.status };
        } catch (error) {
            if (error.name === 'AbortError') {
                return { online: false, code: "Prekinuto" };
            }
            return { online: false, code: "Network Error" };
        }
    }

    function downloadActiveChannels() {
        const content = createM3UContent(activeChannels);
        const d = new Date();
        const blob = new Blob([content], { type: "text/plain" });
        const url = URL.createObjectURL(blob);

        const downloadLink = document.createElement("a");
        downloadLink.href = url;
        downloadLink.download = `${d.getMonth()}-${d.getDate()}-${d.getFullYear()}-ph.m3u`;
        downloadLink.click();
        URL.revokeObjectURL(url); // Clean up the object URL
    }

    function createM3UContent(channels) {
        let content = "#EXTM3U\n";
        channels.forEach(channel => {
            content += `#EXTINF:-1,${channel.name}\n${channel.url}\n`;
        });
        return content;
    }
});
