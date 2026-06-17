import { ChatWidget } from '@/components/chat/ChatWidget'

export default function Home() {
  return (
    <main className="min-h-screen bg-cic-white">
      {/* Navigation */}
      <nav className="bg-cic-white border-b border-neutral-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <img src="/cic-logo.png" alt="CIC Logo" className="w-10 h-10 object-contain" />
              <span className="text-xl font-bold text-cic-red">CIC Insurance</span>
            </div>

            <div className="hidden md:flex gap-8">
              <a href="#" className="text-cic-gray hover:text-cic-red transition-colors text-sm font-medium">
                Products
              </a>
              <a href="#" className="text-cic-gray hover:text-cic-red transition-colors text-sm font-medium">
                About
              </a>
              <a href="#" className="text-cic-gray hover:text-cic-red transition-colors text-sm font-medium">
                Blog
              </a>
              <a href="#" className="text-cic-gray hover:text-cic-red transition-colors text-sm font-medium">
                Contact
              </a>
            </div>

            <button className="bg-cic-red text-cic-white px-6 py-2 rounded-lg font-medium hover:bg-cic-red-dark transition-colors text-sm">
              Get Quote
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="bg-gradient-to-b from-cic-red to-cic-red-dark text-cic-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div>
              <h1 className="text-4xl md:text-5xl font-bold mb-6 leading-tight">
                We want to help you secure their future.
              </h1>
              <p className="text-lg text-red-100 mb-8 leading-relaxed">
                CIC Insurance has been providing comprehensive insurance and financial solutions to Kenyans for over five decades.
              </p>
              <div className="flex gap-4">
                <button className="bg-cic-white text-cic-red px-8 py-3 rounded-lg font-semibold hover:shadow-lg transition-shadow">
                  Learn More
                </button>
                <button className="border-2 border-cic-white text-cic-white px-8 py-3 rounded-lg font-semibold hover:bg-white hover:bg-opacity-10 transition-colors">
                  Get Started
                </button>
              </div>
            </div>
            <div className="hidden md:block">
              <div className="w-full h-64 bg-cic-white bg-opacity-10 rounded-lg flex items-center justify-center">
                <div className="text-6xl">🛡️</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Services Section */}
      <section className="py-20 bg-cic-light">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl md:text-4xl font-bold text-cic-gray mb-4 text-center">How can we help you?</h2>
          <p className="text-center text-neutral-600 mb-12 max-w-2xl mx-auto">
            Explore our wide range of insurance and financial services tailored to meet your needs.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { title: 'Easy Bima', description: 'Quick and easy insurance', icon: '🚗' },
              { title: 'Health Insurance', description: 'Complete health coverage', icon: '🏥' },
              { title: 'Life Assurance', description: 'Protect your family', icon: '👨‍👩‍👧‍👦' },
              { title: 'Retirement Plans', description: 'Plan for your future', icon: '🏖️' },
            ].map((service, i) => (
              <div
                key={i}
                className="bg-cic-white rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow border border-neutral-200"
              >
                <div className="text-3xl mb-4">{service.icon}</div>
                <h3 className="text-lg font-semibold text-cic-gray mb-2">{service.title}</h3>
                <p className="text-neutral-600 text-sm mb-4">{service.description}</p>
                <a href="#" className="text-cic-red font-semibold text-sm hover:underline">
                  Explore →
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-20 bg-cic-red text-cic-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl md:text-4xl font-bold mb-12 text-center">At CIC, we keep our word</h2>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {[
              { label: 'Products', value: '125+' },
              { label: 'Premium Income', value: 'Ksh 23.68 Bn' },
              { label: 'Years Experience', value: '50+' },
              { label: 'Happy Customers', value: '1M+' },
            ].map((stat, i) => (
              <div key={i} className="text-center">
                <div className="text-4xl md:text-5xl font-bold mb-2">{stat.value}</div>
                <div className="text-red-100">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-cic-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-cic-gray mb-6">Ready to get started?</h2>
          <p className="text-lg text-neutral-600 mb-8">
            Chat with our support team or get a quote today. Our AI-powered chatbot is available 24/7 to assist you.
          </p>
          <button className="bg-cic-red text-cic-white px-8 py-4 rounded-lg font-semibold text-lg hover:bg-cic-red-dark transition-colors inline-block">
            Start Your Journey
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-cic-gray text-cic-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            <div>
              <h3 className="font-semibold mb-4">Company</h3>
              <ul className="space-y-2 text-sm text-neutral-400">
                <li>
                  <a href="#" className="hover:text-cic-white">
                    About Us
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-cic-white">
                    Careers
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-cic-white">
                    Blog
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-4">Products</h3>
              <ul className="space-y-2 text-sm text-neutral-400">
                <li>
                  <a href="#" className="hover:text-cic-white">
                    General Insurance
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-cic-white">
                    Life Assurance
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-cic-white">
                    Health Insurance
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-4">Support</h3>
              <ul className="space-y-2 text-sm text-neutral-400">
                <li>
                  <a href="#" className="hover:text-cic-white">
                    Contact Us
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-cic-white">
                    FAQ
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-cic-white">
                    Claims
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-4">Legal</h3>
              <ul className="space-y-2 text-sm text-neutral-400">
                <li>
                  <a href="#" className="hover:text-cic-white">
                    Privacy Policy
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-cic-white">
                    Terms of Service
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-cic-white">
                    Complaints
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-neutral-700 pt-8 text-center text-sm text-neutral-400">
            <p>&copy; 2026 CIC Insurance. All rights reserved.</p>
          </div>
        </div>
      </footer>

      {/* Chat Widget */}
      <ChatWidget />
    </main>
  )
}
