variable "server_ip" {
  description = "Public IPv4 address of the already-created OVH VPS."
  type        = string
}

variable "ssh_user" {
  description = "Initial OVH Linux user that already accepts the SSH key."
  type        = string
  default     = "ubuntu"
}

variable "ssh_private_key_path" {
  description = "Absolute path, or a path under the current user's home, to the SSH private key."
  type        = string
}

variable "ssh_timeout" {
  description = "Timeout used by Terraform while opening the SSH connection."
  type        = string
  default     = "2m"
}
