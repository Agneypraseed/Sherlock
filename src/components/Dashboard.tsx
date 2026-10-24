import DatasetUpload from './DatasetUpload'
import AuditFindings from './AuditFindings'

function Dashboard() {
  return (
    <div id="dashboard">
      <h1>Dashboard</h1>
      <p>Inspect your image datasets and investigate potential problems.</p>
      <div className="dashboard-sections">
        <DatasetUpload />
        <AuditFindings />
      </div>
    </div>
  )
}

export default Dashboard
