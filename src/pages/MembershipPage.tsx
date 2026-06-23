import { Check } from 'lucide-react'

const tiers = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    description: 'Get started tracking your collection.',
    features: [
      'Up to 3 portfolios',
      'Up to 50 cards total',
      'Basic market prices (RAW)',
      'Marketplace access',
      'AI card scanning (5/day)',
    ],
    cta: 'Get started',
    highlight: false,
  },
  {
    name: 'Pro',
    price: '$9',
    period: 'per month',
    description: 'For the serious collector.',
    features: [
      'Unlimited portfolios',
      'Unlimited cards',
      'Full graded pricing (PSA, CGC, BGS...)',
      'Price history charts',
      'AI card scanning (unlimited)',
      'eBay sold lookup',
      'Price alerts',
      'Seller storefront',
    ],
    cta: 'Start free trial',
    highlight: true,
  },
  {
    name: 'Elite',
    price: '$29',
    period: 'per month',
    description: 'For seven-figure portfolios.',
    features: [
      'Everything in Pro',
      'Population reports',
      'API access',
      'Priority support',
      'Early feature access',
      'Portfolio analytics',
      'Custom export',
    ],
    cta: 'Contact us',
    highlight: false,
  },
]

export function MembershipPage() {
  return (
    <div className="max-w-6xl mx-auto px-6 py-16">
      <div className="text-center mb-14">
        <p className="text-gold text-xs font-semibold tracking-widest mb-3">MEMBERSHIP</p>
        <h1 className="font-heading text-4xl md:text-5xl font-bold text-white mb-4">
          Value data, unlocked.
        </h1>
        <p className="text-gray-400 text-lg max-w-xl mx-auto">
          Choose a plan that matches your collection. Start free, upgrade when you're ready.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {tiers.map((tier) => (
          <div
            key={tier.name}
            className={`rounded-2xl border p-8 flex flex-col ${
              tier.highlight
                ? 'bg-gold/5 border-gold/30 relative'
                : 'bg-navy-800 border-white/5'
            }`}
          >
            {tier.highlight && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="bg-gold text-navy-900 text-xs font-bold px-4 py-1 rounded-full">
                  MOST POPULAR
                </span>
              </div>
            )}
            <div className="mb-6">
              <h2 className="font-heading text-2xl font-bold text-white mb-1">{tier.name}</h2>
              <p className="text-gray-500 text-sm">{tier.description}</p>
            </div>
            <div className="mb-6">
              <span className="font-heading text-4xl font-bold text-white">{tier.price}</span>
              <span className="text-gray-500 text-sm ml-2">{tier.period}</span>
            </div>
            <ul className="space-y-3 flex-1 mb-8">
              {tier.features.map((f) => (
                <li key={f} className="flex items-start gap-2.5">
                  <Check
                    size={15}
                    className={`flex-shrink-0 mt-0.5 ${tier.highlight ? 'text-gold' : 'text-gray-500'}`}
                  />
                  <span className="text-gray-300 text-sm">{f}</span>
                </li>
              ))}
            </ul>
            <button
              className={`w-full py-3 rounded-xl font-semibold text-sm transition-opacity hover:opacity-90 ${
                tier.highlight
                  ? 'bg-gold text-navy-900'
                  : 'border border-white/15 text-white hover:bg-white/5'
              }`}
            >
              {tier.cta}
            </button>
          </div>
        ))}
      </div>

      <p className="text-center text-gray-600 text-xs mt-10">
        Pricing is illustrative — CardLoom is in early access. Plans are not yet active.
      </p>
    </div>
  )
}
