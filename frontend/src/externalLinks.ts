export interface ExternalLink {
  label: string
  url: string
}

/** Parse GenBank qualifiers into clickable external DB links. */
export function featureExternalLinks(qualifiers: Record<string, string[]>): ExternalLink[] {
  const links: ExternalLink[] = []

  for (const val of qualifiers.db_xref ?? []) {
    if (val.startsWith('GeneID:')) {
      const id = val.slice('GeneID:'.length)
      links.push({ label: `GeneID:${id}`, url: `https://www.ncbi.nlm.nih.gov/gene/${id}` })
    } else if (val.startsWith('UniProtKB/Swiss-Prot:')) {
      const id = val.slice('UniProtKB/Swiss-Prot:'.length)
      links.push({ label: `UniProt:${id}`, url: `https://www.uniprot.org/uniprot/${id}` })
    }
  }

  for (const val of qualifiers.protein_id ?? []) {
    links.push({ label: val, url: `https://www.ncbi.nlm.nih.gov/protein/${val}` })
  }

  return links
}

/** Open a URL in the system browser (Electron) or a new tab (plain browser). */
export function openExternalLink(url: string): void {
  if (typeof window !== 'undefined' && window.electronAPI?.openExternal) {
    window.electronAPI.openExternal(url)
  } else {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}
