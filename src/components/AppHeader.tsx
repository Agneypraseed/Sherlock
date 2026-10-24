function AppHeader() {
  return (
    <header className="app-header">
      <div className="container header-content">
        <a className="brand" href="#dashboard">DatasetSherlock</a>
        <nav aria-label="Main navigation">
          <a href="#dashboard">Dashboard</a>
          <a href="#dataset-upload">Dataset</a>
          <a href="#audit-findings">Findings</a>
          <a href="#investigation">Investigation</a>
        </nav>
      </div>
    </header>
  )
}

export default AppHeader
