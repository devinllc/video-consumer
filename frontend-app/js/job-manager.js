class JobManager {
    constructor() {
        this.activeJobs = [];
        this.pollingInterval = null;
        this.startPolling();
        
        // Import jobs on initialization
        this.importJobsFromAWS().catch(console.error);
    }
    
    startPolling() {
        if (!this.pollingInterval) {
            this.pollingInterval = setInterval(() => this.fetchJobs(), 2000);
            this.fetchJobs(); // Fetch immediately on start
        }
    }
    
    stopPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
    }
    
    async importJobsFromAWS() {
        try {
            const response = await fetch('/api/import-jobs', {
                method: 'POST'
            });
            const data = await response.json();
            
            if (data.error) {
                console.warn('Import jobs warning:', data.error);
            } else {
                console.log('Jobs imported successfully:', data);
            }
        } catch (error) {
            console.error('Error importing jobs:', error);
        }
    }
    
    async createTestJob(status = 'COMPLETED') {
        try {
            const response = await fetch('/api/create-test-job', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ status })
            });
            const data = await response.json();
            
            if (data.success) {
                console.log('Test job created successfully:', data);
                this.fetchJobs(); // Refresh jobs list
            } else {
                console.error('Error creating test job:', data.error);
            }
            return data;
        } catch (error) {
            console.error('Error creating test job:', error);
            return { success: false, error: error.message };
        }
    }
    
    async fetchJobs() {
        try {
            const response = await fetch('/api/jobs');
            const jobs = await response.json();
            
            // Update our local cache of jobs
            this.activeJobs = jobs;
            
            // Update the UI with the jobs
            this.updateJobsList();
            
            return jobs;
        } catch (error) {
            console.error('Error fetching jobs:', error);
            return [];
        }
    }
    
    updateJobsList() {
        const jobsListElement = document.getElementById('jobs-list');
        if (!jobsListElement) return;
        
        if (this.activeJobs.length === 0) {
            jobsListElement.innerHTML = '<tr><td colspan="4" class="text-center">No active jobs found</td></tr>';
            return;
        }
        
        jobsListElement.innerHTML = this.activeJobs.map(job => {
            const statusBadge = this.getStatusBadge(job.status);
            const videoName = job.videoKey.split('/').pop() || job.videoKey;
            
            return `<tr>
                <td>${job.jobId}</td>
                <td>${videoName}</td>
                <td>${statusBadge}</td>
                <td>
                    <button class="btn btn-sm btn-info" onclick="jobManager.showJobDetails('${job.jobId}')">
                        View Details
                    </button>
                </td>
            </tr>`;
        }).join('');
    }
    
    getStatusBadge(status) {
        const badges = {
            'PENDING': '<span class="badge bg-secondary">Pending</span>',
            'RUNNING': '<span class="badge bg-primary">Running</span>',
            'COMPLETED': '<span class="badge bg-success">Completed</span>',
            'FAILED': '<span class="badge bg-danger">Failed</span>'
        };
        return badges[status] || `<span class="badge bg-secondary">${status}</span>`;
    }
    
    async showJobDetails(jobId) {
        try {
            const response = await fetch(`/api/jobs/${jobId}`);
            const job = await response.json();
            
            if (job.error) {
                alert('Error loading job details: ' + job.error);
                return;
            }
            
            const modal = new bootstrap.Modal(document.getElementById('jobDetailsModal'));
            
            // Update modal content
            document.getElementById('jobDetailsTitle').textContent = `Job: ${jobId}`;
            
            // Basic details
            const detailsHtml = `
                <p><strong>Status:</strong> ${this.getStatusBadge(job.status)}</p>
                <p><strong>Video:</strong> ${job.videoKey}</p>
                <p><strong>Started:</strong> ${new Date(job.startTime).toLocaleString()}</p>
                <p><strong>Performance Level:</strong> ${job.performanceLevel || 'standard'}</p>
            `;
            document.getElementById('jobBasicDetails').innerHTML = detailsHtml;
            
            // Logs
            const logsElement = document.getElementById('jobLogs');
            if (job.logs && job.logs.length > 0) {
                logsElement.innerHTML = job.logs.map(log => 
                    `<div class="log-entry">
                        <span class="log-time">${new Date(log.timestamp).toLocaleTimeString()}</span>
                        <span class="log-message">${log.message}</span>
                    </div>`
                ).join('');
            } else {
                logsElement.innerHTML = '<p class="text-muted">No logs available</p>';
            }
            
            // Streaming info
            const streamingElement = document.getElementById('jobStreaming');
            if (job.streaming) {
                const resolutionsHtml = Object.entries(job.streaming.resolutions || {})
                    .map(([res, url]) => `<li>${res}: <a href="${url}" target="_blank">${url}</a></li>`)
                    .join('');
                    
                streamingElement.innerHTML = `
                    <p><strong>Video ID:</strong> ${job.streaming.videoId}</p>
                    <p><strong>Master Playlist:</strong> <a href="${job.streaming.masterPlaylist}" target="_blank">${job.streaming.masterPlaylist}</a></p>
                    <p><strong>Resolutions:</strong></p>
                    <ul>${resolutionsHtml}</ul>
                `;
            } else {
                streamingElement.innerHTML = '<p class="text-muted">No streaming information available yet</p>';
            }
            
            modal.show();
        } catch (error) {
            console.error('Error fetching job details:', error);
            alert('Error loading job details. Please try again.');
        }
    }
}

// Initialize the job manager when the script loads
window.jobManager = new JobManager(); 