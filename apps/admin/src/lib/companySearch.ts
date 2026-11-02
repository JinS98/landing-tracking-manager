import type { Company, DemoWorkspace, Site } from '../types/tracking';

export function searchCompanies(workspace: DemoWorkspace, search: string): { company: Company; sites: Site[] }[] {
  const query = search.trim().toLowerCase();
  return workspace.companies.flatMap(company => {
    const sites = workspace.sites.filter(site => site.companyId === company.id);
    const companyMatches = [company.name, company.id].some(value => value.toLowerCase().includes(query));
    const visibleSites = companyMatches ? sites : sites.filter(site =>
      [site.id, site.domain].some(value => value.toLowerCase().includes(query)));
    return companyMatches || visibleSites.length ? [{ company, sites: visibleSites }] : [];
  });
}
