// Job Manager to handle all job interactions
class JobManager {
    constructor() {
        this.jobsContainer = document.getElementById('jobs-container');
        this.noJobsMessage = document.getElementById('no-jobs-message');
        this.activeJobs = {};
        this.pollingIntervalId = null;
        this.lastJobCount = 0;
        this.isInitialLoad = true;

        // Start polling for jobs
        this.startPolling();
    }

    // Start polling for job updates
    startPolling() {
        // Initial fetch
        this.fetchJobs();

        // Set up interval for continuous polling (every 5 seconds)
        this.pollingIntervalId = setInterval(() => {
            this.fetchJobs();
        }, 5000);
    }

    // Stop polling for job updates
    stopPolling() {
        if (this.pollingIntervalId) {
            clearInterval(this.pollingIntervalId);
            this.pollingIntervalId = null;
        }
    }

    // Fetch all jobs from the API
    async fetchJobs() {
        try {
            // On initial load or when no jobs are found, try to import from AWS first
            if (this.isInitialLoad || Object.keys(this.activeJobs).length === 0) {
                try {
                    console.log("Triggering job import from AWS...");
                    const importResponse = await fetch('/api/import-jobs', {
                        method: 'POST'
                    });
                    const importResult = await importResponse.json();
                    console.log("Import result:", importResult);
                    this.isInitialLoad = false;
                } catch (importError) {
                    console.error("Error importing jobs:", importError);
                }
            }

            // Fetch jobs list
            const response = await fetch('/api/jobs');
            const jobs = await response.json();

            // Track if we've added any new jobs
            let newJobsAdded = false;

            // Process each job
            jobs.forEach(job => {
                // Check if this is a new job
                if (!this.activeJobs[job.jobId]) {
                    newJobsAdded = true;
                }

                // Add or update the job in our local state
                this.activeJobs[job.jobId] = job;

                // Refresh the job details (logs, etc.) if it's already displayed
                if (document.getElementById(`job-${job.jobId}`)) {
                    this.fetchJobDetails(job.jobId);
                }
            });

            // If the job count changed, completely refresh the display
            if (jobs.length !== this.lastJobCount || newJobsAdded) {
                console.log(`Job count changed from ${this.lastJobCount} to ${jobs.length}. Refreshing display.`);
                this.lastJobCount = jobs.length;
                this.renderJobsList();
            }

            // Toggle visibility of the no-jobs message
            if (jobs.length > 0) {
                this.noJobsMessage.style.display = 'none';
                this.jobsContainer.style.display = 'block';
            } else {
                this.noJobsMessage.style.display = 'block';
                this.jobsContainer.style.display = 'none';
            }
        } catch (error) {
            console.error('Error fetching jobs:', error);
        }
    }

    // Fetch details for a specific job
    async fetchJobDetails(jobId) {
        try {
            const response = await fetch(`/api/jobs/${jobId}`);
            if (!response.ok) {
                throw new Error(`HTTP error ${response.status}`);
            }

            const jobDetails = await response.json();

            // Update our local copy
            this.activeJobs[jobId] = { ...this.activeJobs[jobId], ...jobDetails };

            // Update the job card with logs and status
            this.updateJobCard(jobId, jobDetails);
        } catch (error) {
            console.error(`Error fetching details for job ${jobId}:`, error);
        }
    }

    renderJobsList() {
        // Clear the container first
        this.jobsContainer.innerHTML = '';

        // Get all jobs and sort by start time (newest first)
        const jobs = Object.values(this.activeJobs)
            .sort((a, b) => new Date(b.startTime) - new Date(a.startTime));

        // Create a card for each job
        jobs.forEach(job => {
            const jobCard = this.createJobCard(job);
            this.jobsContainer.appendChild(jobCard);

            // Fetch detailed info for this job (logs, etc.)
            this.fetchJobDetails(job.jobId);
        });
    }

    createJobCard(job) {
        const card = document.createElement('div');
        card.className = 'job-card';
        card.id = `job-${job.jobId}`;

        // Set card color based on status
        let statusClass = '';
        switch (job.status) {
            case 'RUNNING':
                statusClass = 'job-running';
                break;
            case 'COMPLETED':
                statusClass = 'job-completed';
                break;
            case 'FAILED':
                statusClass = 'job-failed';
                break;
            default:
                statusClass = 'job-pending';
        }
        card.classList.add(statusClass);

        // Format the job ID to be shorter
        const shortJobId = job.jobId.substring(0, 8) + '...';

        // Format the video key to get just the filename
        const videoName = job.videoKey.split('/').pop() || 'Unknown Video';

        // Format the date
        const startDate = new Date(job.startTime).toLocaleString();

        // Create card header
        const header = document.createElement('div');
        header.className = 'job-header';
        header.innerHTML = `
            <h3>${videoName}</h3>
            <div class="job-meta">
                <span class="job-id">ID: ${shortJobId}</span>
                <span class="job-date">Started: ${startDate}</span>
                <span class="job-status">Status: ${job.status}</span>
            </div>
        `;

        // Create logs container
        const logsContainer = document.createElement('div');
        logsContainer.className = 'job-logs';
        logsContainer.id = `logs-${job.jobId}`;
        logsContainer.innerHTML = '<p>Loading logs...</p>';

        // Add streaming section for completed jobs
        let streamingSection = '';
        if (job.streaming) {
            streamingSection = document.createElement('div');
            streamingSection.className = 'job-streaming';
            streamingSection.innerHTML = `
                <h4>Streaming URLs</h4>
                <a href="${job.streaming.masterPlaylist}" target="_blank" class="streaming-link">Master Playlist</a>
            `;

            // Add resolution-specific links if available
            if (job.streaming.resolutions) {
                const resolutionsList = document.createElement('ul');
                resolutionsList.className = 'resolutions-list';

                Object.entries(job.streaming.resolutions).forEach(([resolution, url]) => {
                    const listItem = document.createElement('li');
                    listItem.innerHTML = `<a href="${url}" target="_blank">${resolution}</a>`;
                    resolutionsList.appendChild(listItem);
                });

                streamingSection.appendChild(resolutionsList);
            }
        }

        // Assemble the card
        card.appendChild(header);
        card.appendChild(logsContainer);
        if (streamingSection) {
            card.appendChild(streamingSection);
        }

        return card;
    }

    updateJobCard(jobId, jobDetails) {
        const logsContainer = document.getElementById(`logs-${jobId}`);
        if (!logsContainer) return;

        // Update status class
        const card = document.getElementById(`job-${jobId}`);
        if (card) {
            // Remove old status classes
            card.classList.remove('job-pending', 'job-running', 'job-completed', 'job-failed');

            // Add new status class
            let statusClass = '';
            switch (jobDetails.status) {
                case 'RUNNING':
                    statusClass = 'job-running';
                    break;
                case 'COMPLETED':
                    statusClass = 'job-completed';
                    break;
                case 'FAILED':
                    statusClass = 'job-failed';
                    break;
                default:
                    statusClass = 'job-pending';
            }
            card.classList.add(statusClass);

            // Update the status text
            const statusElement = card.querySelector('.job-status');
            if (statusElement) {
                statusElement.textContent = `Status: ${jobDetails.status}`;
            }
        }

        // Format and display logs
        if (jobDetails.logs && jobDetails.logs.length > 0) {
            const logsHtml = jobDetails.logs.map(log => {
                const time = new Date(log.timestamp).toLocaleTimeString();
                return `<div class="log-entry"><span class="log-time">${time}</span> ${log.message}</div>`;
            }).join('');

            logsContainer.innerHTML = logsHtml;

            // Scroll to bottom to show latest logs
            logsContainer.scrollTop = logsContainer.scrollHeight;
        } else {
            logsContainer.innerHTML = '<p>No logs available yet.</p>';
        }

        // Add streaming section if it's not already there and the job is completed
        if (jobDetails.streaming && jobDetails.status === 'COMPLETED') {
            let streamingSection = card.querySelector('.job-streaming');

            // If streaming section doesn't exist, create it
            if (!streamingSection) {
                streamingSection = document.createElement('div');
                streamingSection.className = 'job-streaming';
                streamingSection.innerHTML = `
                    <h4>Streaming URLs</h4>
                    <a href="${jobDetails.streaming.masterPlaylist}" target="_blank" class="streaming-link">Master Playlist</a>
                `;

                // Add resolution-specific links
                if (jobDetails.streaming.resolutions) {
                    const resolutionsList = document.createElement('ul');
                    resolutionsList.className = 'resolutions-list';

                    Object.entries(jobDetails.streaming.resolutions).forEach(([resolution, url]) => {
                        const listItem = document.createElement('li');
                        listItem.innerHTML = `<a href="${url}" target="_blank">${resolution}</a>`;
                        resolutionsList.appendChild(listItem);
                    });

                    streamingSection.appendChild(resolutionsList);
                }

                card.appendChild(streamingSection);
            }
        }
    }

    // Call this when the page is being unloaded
    cleanup() {
        this.stopPolling();
    }
}

// Initialize the job manager when the page loads
window.addEventListener('load', () => {
    window.jobManager = new JobManager();
});

// Clean up when leaving the page
window.addEventListener('beforeunload', () => {
    if (window.jobManager) {
        window.jobManager.cleanup();
    }
}); 