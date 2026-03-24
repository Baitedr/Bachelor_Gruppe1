u = User.new(email: 'testbaz@example.com', name: 'TestBaz', password: 'Password123'); p u.valid?; p u.errors.full_messages; p u.oauth_user?  
