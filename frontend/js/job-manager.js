// Job Manager to handle all job interactions
class JobManager {
    constructor() {
        this.activeJobs = new Map();
        this.pollInterval = null;
        this.retryCount = 0;
        this.maxRetries = 10;
    }

    // Start polling for job updates
    startPolling() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
        }

        this.retryCount = 0;
        this.pollInterval = setInterval(() => this.fetchJobs(), 2000);
        this.fetchJobs(); // Fetch immediately on start
    }

    // Stop polling for job updates
    stopPolling() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    }

    // Fetch all jobs from the API
    async fetchJobs() {
        try {
            // Make sure the server is running on the correct port
            const ports = [3001, 3002, 3003]; // Try all possible ports
            let jobsData = [];
            let fetchSucceeded = false;

            for (const port of ports) {
                if (fetchSucceeded) continue;

                try {
                    // First try to import jobs from AWS
                    console.log(`Attempting to import jobs from AWS via port ${port}...`);
                    try {
                        const importResponse = await fetch(`http://localhost:${port}/api/import-jobs`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' }
                        });

                        if (importResponse.ok) {
                            const importResult = await importResponse.json();
                            console.log('Import result:', importResult);
                        }
                    } catch (importErr) {
                        console.log(`Failed to import jobs from port ${port}:`, importErr);
                    }

                    // Now get the jobs list
                    const response = await fetch(`http://localhost:${port}/api/jobs`, {
                        method: 'GET',
                        headers: { 'Content-Type': 'application/json' }
                    });

                    if (!response.ok) continue;

                    jobsData = await response.json();
                    fetchSucceeded = true;
                    console.log(`Successfully fetched jobs from port ${port}:`, jobsData);
                    window.apiPort = port; // Remember this port for future requests
                } catch (err) {
                    console.log(`Failed to fetch jobs from port ${port}:`, err);
                }
            }

            if (!fetchSucceeded) {
                this.retryCount++;
                console.log(`Failed to fetch jobs from any port. Retry ${this.retryCount}/${this.maxRetries}`);

                if (this.retryCount >= this.maxRetries) {
                    this.stopPolling();
                    this.showError("Server connection lost. Please refresh the page.");
                }
                return;
            }

            // Reset retry count on success
            this.retryCount = 0;

            // Update job list
            this.updateJobList(jobsData);

            // Also fetch individual job details for any active jobs
            for (const job of jobsData) {
                this.fetchJobDetails(job.jobId);
            }

            if (jobsData.length === 0) {
                document.getElementById('jobs-list').innerHTML = '<tr><td colspan="4" class="text-center">No active jobs found</td></tr>';
            }
        } catch (error) {
            console.error('Error fetching jobs:', error);
            document.getElementById('jobs-list').innerHTML = '<tr><td colspan="4" class="text-center">Error fetching jobs</td></tr>';
        }
    }

    // Update the job list in the UI
    updateJobList(jobsData) {
        // If no jobs, show message
        if (jobsData.length === 0) {
            document.getElementById('jobs-list').innerHTML = '<tr><td colspan="4" class="text-center">No active jobs found</td></tr>';
            return;
        }

        // Build job list HTML
        let jobsHtml = '';

        jobsData.forEach(job => {
            const jobId = job.jobId;
            const status = job.status;

            // Track this job if it's new
            if (!this.activeJobs.has(jobId)) {
                this.activeJobs.set(jobId, {
                    status: status,
                    lastUpdated: new Date()
                });
            }

            const videoName = job.videoKey ? job.videoKey.split('/').pop() : 'Unknown';
            const startTime = new Date(job.startTime).toLocaleString();

            let statusClass = '';
            switch (status) {
                case 'RUNNING':
                    statusClass = 'badge bg-info';
                    break;
                case 'COMPLETED':
                    statusClass = 'badge bg-success';
                    break;
                case 'FAILED':
                    statusClass = 'badge bg-danger';
                    break;
                default:
                    statusClass = 'badge bg-secondary';
            }

            jobsHtml += `
            <tr data-job-id="${jobId}">
                <td>${jobId.substring(0, 8)}...</td>
                <td>${videoName}</td>
                <td><span class="${statusClass}">${status}</span></td>
                <td>
                    <button class="btn btn-sm btn-primary view-job" data-job-id="${jobId}">View</button>
                </td>
            </tr>
            `;
        });

        document.getElementById('jobs-list').innerHTML = jobsHtml;

        // Add event listeners to view buttons
        document.querySelectorAll('.view-job').forEach(button => {
            button.addEventListener('click', (e) => {
                const jobId = e.target.getAttribute('data-job-id');
                this.showJobDetailsModal(jobId);
            });
        });
    }

    // Fetch details for a specific job
    async fetchJobDetails(jobId) {
        try {
            const port = window.apiPort || 3001;
            const response = await fetch(`http://localhost:${port}/api/jobs/${jobId}`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch job details: ${response.status}`);
            }

            const jobDetails = await response.json();

            // Store job details in the active jobs map
            const existingJob = this.activeJobs.get(jobId) || {};
            this.activeJobs.set(jobId, {
                ...existingJob,
                ...jobDetails,
                lastUpdated: new Date()
            });

            // If there's an open modal for this job, update it
            const modal = document.getElementById('jobDetailsModal');
            if (modal && modal.getAttribute('data-job-id') === jobId) {
                this.updateJobDetailsModal(jobId);
            }

            return jobDetails;
        } catch (error) {
            console.error(`Error fetching job details for ${jobId}:`, error);
            return null;
        }
    }

    // Show job details in a modal
    async showJobDetailsModal(jobId) {
        // Create modal if it doesn't exist
        let modal = document.getElementById('jobDetailsModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.className = 'modal fade';
            modal.id = 'jobDetailsModal';
            modal.setAttribute('tabindex', '-1');
            modal.setAttribute('aria-labelledby', 'jobDetailsModalLabel');
            modal.setAttribute('aria-hidden', 'true');

            modal.innerHTML = `
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title" id="jobDetailsModalLabel">Job Details</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body">
                        <div class="mb-3">
                            <strong>Job ID:</strong> <span id="job-id"></span>
                        </div>
                        <div class="mb-3">
                            <strong>Status:</strong> <span id="job-status"></span>
                        </div>
                        <div class="mb-3">
                            <strong>Video:</strong> <span id="job-video"></span>
                        </div>
                        <div class="mb-3">
                            <strong>Start Time:</strong> <span id="job-start-time"></span>
                        </div>
                        <div id="streaming-info-container" class="mb-3 d-none">
                            <strong>Streaming:</strong>
                            <div id="streaming-info" class="mt-2"></div>
                        </div>
                        <div class="mb-3">
                            <strong>Logs:</strong>
                            <div id="job-logs" class="mt-2 border p-2 bg-dark text-light" style="height: 300px; overflow-y: auto; font-family: monospace;"></div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                        <button type="button" id="refresh-logs-btn" class="btn btn-primary">Refresh Logs</button>
                    </div>
                </div>
            </div>
            `;

            document.body.appendChild(modal);

            // Add event listener for refresh button
            document.getElementById('refresh-logs-btn').addEventListener('click', () => {
                const currentJobId = modal.getAttribute('data-job-id');
                if (currentJobId) {
                    this.fetchJobDetails(currentJobId);
                }
            });
        }

        // Set the current job ID
        modal.setAttribute('data-job-id', jobId);

        // Fetch job details if we don't have them
        if (!this.activeJobs.has(jobId) || !this.activeJobs.get(jobId).logs) {
            await this.fetchJobDetails(jobId);
        }

        // Update modal content
        this.updateJobDetailsModal(jobId);

        // Show the modal
        const modalInstance = new bootstrap.Modal(modal);
        modalInstance.show();
    }

    // Update the job details modal with current information
    updateJobDetailsModal(jobId) {
        const job = this.activeJobs.get(jobId);
        if (!job) return;

        document.getElementById('job-id').textContent = jobId;

        // Set status with appropriate styling
        const statusEl = document.getElementById('job-status');
        let statusClass = '';
        switch (job.status) {
            case 'RUNNING':
                statusClass = 'badge bg-info';
                break;
            case 'COMPLETED':
                statusClass = 'badge bg-success';
                break;
            case 'FAILED':
                statusClass = 'badge bg-danger';
                break;
            default:
                statusClass = 'badge bg-secondary';
        }
        statusEl.innerHTML = `<span class="${statusClass}">${job.status}</span>`;

        // Set video info
        document.getElementById('job-video').textContent = job.videoKey || 'Unknown';

        // Set start time
        document.getElementById('job-start-time').textContent =
            job.startTime ? new Date(job.startTime).toLocaleString() : 'Unknown';

        // Display streaming info if available
        const streamingContainer = document.getElementById('streaming-info-container');
        const streamingInfo = document.getElementById('streaming-info');

        if (job.streaming) {
            streamingContainer.classList.remove('d-none');
            let html = `
            <div class="card">
                <div class="card-body">
                    <h6 class="card-title">Available Streams</h6>
                    <p><strong>Master Playlist:</strong> <a href="${job.streaming.masterPlaylist}" target="_blank">${job.streaming.masterPlaylist}</a></p>
                    <p><strong>Resolutions:</strong></p>
                    <ul>
            `;

            for (const [resolution, url] of Object.entries(job.streaming.resolutions)) {
                html += `<li>${resolution}: <a href="${url}" target="_blank">${url}</a></li>`;
            }

            html += `
                    </ul>
                    <p class="mt-3">
                        <a href="/player.html?url=${encodeURIComponent(job.streaming.masterPlaylist)}" class="btn btn-success" target="_blank">
                            Watch Video
                        </a>
                    </p>
                </div>
            </div>
            `;

            streamingInfo.innerHTML = html;
        } else {
            streamingContainer.classList.add('d-none');
        }

        // Display logs
        const logsEl = document.getElementById('job-logs');
        let logsHtml = '';

        if (job.logs && job.logs.length > 0) {
            job.logs.forEach(log => {
                let timestamp = log.timestamp;
                try {
                    timestamp = new Date(log.timestamp).toLocaleTimeString();
                } catch (e) { }

                logsHtml += `<div>[${timestamp}] ${log.message}</div>`;
            });
        } else {
            logsHtml = '<div class="text-warning">No logs available yet.</div>';
        }

        logsEl.innerHTML = logsHtml;

        // Auto-scroll to bottom of logs
        logsEl.scrollTop = logsEl.scrollHeight;
    }

    // Show an error message
    showError(message) {
        const alertEl = document.createElement('div');
        alertEl.className = 'alert alert-danger alert-dismissible fade show';
        alertEl.setAttribute('role', 'alert');
        alertEl.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        `;

        const container = document.querySelector('.container');
        container.insertBefore(alertEl, container.firstChild);
    }

    // Start transcoding job
    async startTranscoding(videoKey, performanceLevel = 'standard') {
        try {
            const port = window.apiPort || 3001;
            const response = await fetch(`http://localhost:${port}/api/start-transcoding`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ videoKey, performanceLevel })
            });

            if (!response.ok) {
                throw new Error(`Failed to start transcoding: ${response.status}`);
            }

            const result = await response.json();
            console.log('Transcoding started:', result);

            // Start polling for job updates
            this.startPolling();

            // Show job details right away
            setTimeout(() => {
                this.showJobDetailsModal(result.jobId);
            }, 1000);

            return result;
        } catch (error) {
            console.error('Error starting transcoding:', error);
            this.showError(`Failed to start transcoding: ${error.message}`);
            return null;
        }
    }
}

// Initialize the global job manager
window.jobManager = new JobManager(); 