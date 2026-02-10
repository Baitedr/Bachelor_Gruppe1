# Create sample items
Item.create([
  { name: 'First Item', description: 'This is the first sample item' },
  { name: 'Second Item', description: 'This is the second sample item' },
  { name: 'Third Item', description: 'This is the third sample item' }
])

puts "Created #{Item.count} items"
