// NCBI Translation Table 11 — Bacterial, Archaeal and Plant Plastid Code.
// Internal codons are identical to the Standard Code (Table 1).
// Alt-start codons encode fMet at position 1 even though they normally code
// for a different amino acid (Val, Leu, Ile).

const CODON: Record<string, string> = {
  TTT:'F', TTC:'F', TTA:'L', TTG:'L',
  CTT:'L', CTC:'L', CTA:'L', CTG:'L',
  ATT:'I', ATC:'I', ATA:'I', ATG:'M',
  GTT:'V', GTC:'V', GTA:'V', GTG:'V',
  TCT:'S', TCC:'S', TCA:'S', TCG:'S',
  CCT:'P', CCC:'P', CCA:'P', CCG:'P',
  ACT:'T', ACC:'T', ACA:'T', ACG:'T',
  GCT:'A', GCC:'A', GCA:'A', GCG:'A',
  TAT:'Y', TAC:'Y', TAA:'*', TAG:'*',
  CAT:'H', CAC:'H', CAA:'Q', CAG:'Q',
  AAT:'N', AAC:'N', AAA:'K', AAG:'K',
  GAT:'D', GAC:'D', GAA:'E', GAG:'E',
  TGT:'C', TGC:'C', TGA:'*', TGG:'W',
  CGT:'R', CGC:'R', CGA:'R', CGG:'R',
  AGT:'S', AGC:'S', AGA:'R', AGG:'R',
  GGT:'G', GGC:'G', GGA:'G', GGG:'G',
}

// Non-ATG codons that initiate translation in bacteria (Table 11).
// All encode fMet at the start position.
const ALT_STARTS = new Set(['GTG', 'TTG', 'CTG', 'ATT', 'ATC', 'ATA'])

export interface TranslationResult {
  protein:  string   // single-letter AAs; terminates at first stop codon (not included)
  altStart: boolean  // true when position-1 codon was a non-ATG alt start
  partial:  boolean  // true when sequence length is not a multiple of 3
}

/**
 * Translate a 5′→3′ DNA string using NCBI Translation Table 11.
 * Pass the coding strand (reverse-complemented if the feature is on the minus strand).
 */
export function translate(dna: string): TranslationResult {
  const seq     = dna.toUpperCase()
  const nCodons = Math.floor(seq.length / 3)
  const partial = seq.length % 3 !== 0

  if (nCodons === 0) return { protein: '', altStart: false, partial }

  const aas: string[] = []
  let altStart = false

  for (let i = 0; i < nCodons; i++) {
    const codon = seq.slice(i * 3, i * 3 + 3)
    if (i === 0) {
      if (codon === 'ATG') {
        aas.push('M')
      } else if (ALT_STARTS.has(codon)) {
        aas.push('M')   // fMet
        altStart = true
      } else {
        aas.push(CODON[codon] ?? 'X')
      }
    } else {
      const aa = CODON[codon] ?? 'X'
      if (aa === '*') break  // stop codon: terminate, do not include '*'
      aas.push(aa)
    }
  }

  return { protein: aas.join(''), altStart, partial }
}
