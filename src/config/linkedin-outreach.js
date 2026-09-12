const companies = ['Rippling', 'Flipkart', 'Zerodha', 'BrowserStack', 'Swiggy', 'Zomato'];

export default companies.map((company) => ({
  company,
  recruiterUrl: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${company} recruiter`)}`,
  hiringManagerUrl: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${company} engineering manager`)}`,
}));
