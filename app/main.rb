require_relative 'streamer'
loop do
  Streamer.new.start!
  sleep 5
end
