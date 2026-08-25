locals {
  provision_script = abspath("${path.module}/../provision.sh")
}

# This resource intentionally bootstraps an existing VPS instead of ordering
# one. The OVH VPS product is billable infrastructure; adding an ovh_vps
# resource here without an explicit import/plan could create a second server.
resource "terraform_data" "coolify_bootstrap" {
  triggers_replace = {
    server_ip     = var.server_ip
    ssh_user      = var.ssh_user
    script_sha256 = filesha256(local.provision_script)
  }

  connection {
    type        = "ssh"
    host        = var.server_ip
    user        = var.ssh_user
    private_key = file(pathexpand(var.ssh_private_key_path))
    timeout     = var.ssh_timeout
  }

  provisioner "file" {
    source      = local.provision_script
    destination = "/tmp/cogito-provision.sh"
  }

  provisioner "remote-exec" {
    inline = [
      "chmod 700 /tmp/cogito-provision.sh",
      "sudo -n bash /tmp/cogito-provision.sh",
      "rm -f /tmp/cogito-provision.sh",
    ]
  }
}
