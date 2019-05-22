
# -*- coding: utf-8 -*-
"""
Created on Apr 20 9:30:23 2019

@author: Santiago
"""

"""
principales funciones
"""

"""____________________________________________________________________________________________________________________________"""
"""Proceso previo"""
#inicializacion de principales variables
import os
import sys
import tkinter as tk

#import avariables and moddules
import Bioturbation as b
import config

print(config.count)
#Iniciacion de la ventana
root = tk.Tk()
root.configure(bg="papaya whip")
root.title('IchnopaleoCount alfa 1.0')
root.wm_iconbitmap("IconWindow.ico")
root.wm_title('IP')

#Inicio del programa
#0
print("Progam iniciated")

"""Layout disgn________________________________________________________________________________________________________________________________________________________"""
#main containers
Topframe=tk.Frame(root,bg='Peach puff', width=900, height=200, pady=5,padx=5)
Leftframe=tk.Frame(root,bg='lemon chiffon', width=450, height=400, pady=5,padx=5)
Rightframe=tk.Frame(root,bg='mint cream', width=450, height=400, pady=5,padx=5)

# layout all of the main containers
root.grid_rowconfigure(0, weight=1)
root.grid_rowconfigure(1, weight=1)
root.grid_columnconfigure(0, weight=1)
root.grid_columnconfigure(1, weight=1)

Topframe.grid(row=0, columnspan=2, sticky="new")
Leftframe.grid(row=1,column=0,sticky="ew")
Rightframe.grid(row=1,column=1, sticky="ew")

#widgets for top frame
Topframe.grid_rowconfigure(0, weight=1)
Topframe.grid_columnconfigure(1, weight=3)

heading = tk.Label(Topframe,bg='Peach puff', text="Welcome to Ichnopaleo (alfa 1.0)", font=("arial",20,"bold"),fg="black")
logo = tk.PhotoImage(file=str(os.getcwd())+"/logos/logoIchno.gif")
heading.grid(row=0, column=0,sticky="ew")
tk.Label(Topframe,bg='Peach puff',image=logo).grid(row=0,column=1,sticky="e")

#left Frame configure
Leftframe.grid_rowconfigure(0, weight=1)
Leftframe.grid_columnconfigure(1, weight=1)

#right frame configure
Rightframe.grid_rowconfigure(0, weight=1)
Rightframe.grid_columnconfigure(1, weight=1)


""" MENUS_________________________________________________________________________________________________________________________________________________________________________"""

menu = tk.Menu(root)
root.config(menu=menu)

filemenu = tk.Menu(menu)
#file menu
def asigner(Leftframe):
    import Bioturbation as b
    b.OpenImg(Leftframe)
    config.count=config.count+1
def stablishfolder():
    from tkinter import filedialog
    import config
    config.PathtoWfolder=filedialog.askdirectory(initialdir="/",title='Please select a directory')
menu.add_cascade(label="File", menu=filemenu)
filemenu.add_command(label="Open an image", command= lambda: asigner(Leftframe))
filemenu.add_command(label="Open geochemical data frame",state=tk.DISABLED) #future expansion
filemenu.add_separator()
filemenu.add_command(label="New Working folder",command=lambda:stablishfolder())
filemenu.add_separator()
filemenu.add_command(label="Exit",command= sys.exit)

#Bioturbation plot menu

analyzemenu=tk.Menu(menu)
menu.add_cascade(label="Bioturbation Tools", menu=analyzemenu)
analyzemenu.add_command(label="Analyze core fragment image",command= lambda:b.CoreAnalysis(Rightframe))
analyzemenu.add_command(label="Entire image by fragments",command=lambda:b.CreateFullFolder(root))


analyzemenu.add_command(label="Entire image by fragments",state=tk.DISABLED)#future expansion
#Other tools
def exceler(root):
    import Excelmerger as Gtools
    Gtools.ExcelMerger(root)
def DepthtoAgeI(root):
    import AgeConverter

OtherTools = tk.Menu(menu)
menu.add_cascade(label="Other tools", menu=OtherTools)
OtherTools.add_command(label="ExcelMerger",command=lambda: exceler(root))
OtherTools.add_command(label="Depth to Age",command=lambda: DepthtoAgeI(root))
#geochemistry menu future expansion
geochemic = tk.Menu(menu)
menu.add_cascade(label="Geochemical Tools", menu=geochemic)
analyzemenu.add_command(label="Plot Data",state=tk.DISABLED)
"""incioo del loop_________________________________________________________________________________________________________________________________________________________________________"""
root.mainloop()
