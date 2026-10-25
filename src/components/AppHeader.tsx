import Icon from './Icon'

function AppHeader() {
  return (
    <header className="app-header">
      <div className="container header-content">
        <a className="brand" href="#dashboard"><Icon name="search" size={34} /><span>DatasetSherlock</span></a>
        <nav aria-label="Main navigation">
          <a href="#dashboard" aria-current="page">Dashboard</a>
          <a href="#dataset-upload">Dataset</a>
          <a href="#audit-findings">Findings</a>
          <a href="#investigation">Investigation</a>
        </nav>
      </div>
    </header>
  )
}

export default AppHeader
