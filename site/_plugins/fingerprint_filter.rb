require 'liquid'

module FingerprintFilter
  def fingerprint file
    @fingerprint ||= {}
    @fingerprint[file] ||= begin
      source = @context.registers[:site].source
      filename = File.join source, file
      return md5 File.read filename if File.exists? filename

      `git rev-parse HEAD`.chomp
    end
  end

  def md5 string
    Digest::MD5.hexdigest string if string
  end
end

Liquid::Template.register_filter FingerprintFilter
